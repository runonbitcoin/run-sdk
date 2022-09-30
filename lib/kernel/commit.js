/**
 * Commit.js
 *
 * A record that has been locked in and may be published or exported
 */

const bsv = require('bsv')
const { _assert, _defined } = require('./misc')
const { _sudo } = require('./admin')
const { _deepVisit } = require('./deep')
const { _BINDINGS, _compileLocation } = require('./bindings')
const Snapshot = require('./snapshot')
const Log = require('./log')
const _publish = require('./publish')
const { _PROTOCOL_VERSION } = require('./version')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Commit'

// All commits being published. This is tracked globally so we can look up commits.
const COMMITS_PUBLISHING = new Map() // ID -> Commit

// ------------------------------------------------------------------------------------------------
// Commit
// ------------------------------------------------------------------------------------------------

class Commit {
  /**
   * Creates a new commit from a record and starts publishing it
   */
  constructor (record) {
    if (Log._debugOn) Log._debug(TAG, 'Create', record._id)

    // Store the record that has all of the changes in this commit
    _assert(record._actions.length)
    _assert(record._inputs._size || record._outputs._size || record._deletes._size)
    this._record = record

    // Save the kernel used to publish this commit
    this._kernel = record._kernel

    // Lock in the app and protocol version for this commit
    this._app = this._kernel._app
    this._version = _PROTOCOL_VERSION

    // Set the base transaction
    this._base = new bsv.Transaction()

    // Commits that depend on us
    this._downstream = []

    // Create the after snapshots
    this._after = new Map()
    this._generateAfterStates()

    // No refmap to start
    this._refmap = null

    // Set of listeners when the commit has no more dependencies (ready),
    // and also when the tx is broadcast or fails to broadcast (publish).
    this._readyListeners = []
    this._publishListeners = []

    // State of publishing
    this._published = false

    // Publish when ready
    if (this._record._autopublish) {
      this._setPublishing(true)
      this._onReady().then(() => _publish(this))
    }

    // Notify outputs and deletes
    if (!this._record._replaying) {
      this._record._outputs._forEach(creation => this._kernel._emit('update', creation))
      this._record._deletes._forEach(creation => this._kernel._emit('update', creation))
    }

    // States and state hashes
    this.states = null
    this.stateHashes = null
  }

  // --------------------------------------------------------------------------

  _generateAfterStates () {
    const generateAfterState = creation => {
      if (!this._after.has(creation)) {
        const snapshot = new Snapshot(creation)
        this._after.set(creation, snapshot)
      }
    }

    this._record._outputs._forEach(creation => generateAfterState(creation))
    this._record._deletes._forEach(creation => generateAfterState(creation))
  }

  // --------------------------------------------------------------------------

  _setPublishing (publishing) {
    if (publishing) {
      _assert(!this._published)
      _assert(!COMMITS_PUBLISHING.has(this._record._id))

      COMMITS_PUBLISHING.set(this._record._id, this)
    } else {
      COMMITS_PUBLISHING.delete(this._record._id)

      // We should have notified all publish listeners and downstream commits by now
      _assert(!this._publishListeners.length)
      _assert(!this._downstream.length)
    }
  }

  // --------------------------------------------------------------------------

  _publishing () {
    return COMMITS_PUBLISHING.has(this._record._id)
  }

  // --------------------------------------------------------------------------

  async _onReady () {
    const record = this._record

    // First, filter out commits already published
    record._upstream = record._upstream.filter(commit => !commit._published)

    // If no more, then return
    if (!record._upstream.length) return

    // Hook up this commit to its unpublished upstream commits
    record._upstream
      .filter(commit => !commit._downstream.includes(this))
      .forEach(commit => commit._downstream.push(this))

    // Wait for upstream to finish
    await new Promise((resolve, reject) => this._readyListeners.push({ resolve, reject }))
  }

  // --------------------------------------------------------------------------

  async _onPublish () {
    _assert(this._publishing())
    await new Promise((resolve, reject) => this._publishListeners.push({ resolve, reject }))
  }

  // --------------------------------------------------------------------------

  /**
   * Notification when an upstream commit is published to start publishing this one.
   */
  _onUpstreamPublished (commit) {
    const record = this._record

    // Update our various local state with the newly published bindings
    for (const [creation, prevafter] of commit._after) {
      const ours = record._inputs._get(creation) || record._refs._get(creation)
      if (!ours) continue

      // Update the before snapshots with new bindings
      const before = record._before.get(ours)
      if (before) _BINDINGS.forEach(binding => { before._props[binding] = prevafter._props[binding] })

      // Update the after states with assigned bindings
      const after = this._after.get(ours)
      if (after) {
        const props = after._props
        after._props.origin = prevafter._props.origin
        if (!_defined(props.owner)) props.owner = prevafter._props.owner
        if (!_defined(props.satoshis)) props.satoshis = prevafter._props.satoshis
      }

      // Update the jig with assigned bindings. Location and nonce not required.
      _sudo(() => {
        ours.origin = prevafter._props.origin
        if (!_defined(ours.owner)) ours.owner = prevafter._props.owner
        if (!_defined(ours.satoshis)) ours.satoshis = prevafter._props.satoshis
      })
    }

    // Filter out this published commit from our upstream set
    record._upstream = record._upstream.filter(c => c !== commit)

    // If there are no more upstream commits, then fire the ready listener
    if (!record._upstream.length) {
      this._readyListeners.forEach(s => s.resolve())
      this._readyListeners = []
    }
  }

  // --------------------------------------------------------------------------

  /**
   * Returns whether the creation is an input in a downstream commit
   */
  _spentDownstream (creation) {
    return this._downstream.some(commit => commit._record._inputs._has(creation))
  }

  // --------------------------------------------------------------------------

  async _buildRefmap (timeout) {
    if (this._refmap) return this._refmap

    // Get the creations as they will be loaded by a future replay
    const _load = require('./load')
    const session = new _load._Session()
    const record = this._record
    const incoming = record._inputs._arr().concat(record._refs._arr())
    const beforeLocations = incoming.map(creation => record._before.get(creation)._props.location)
    const beforeCreations = await Promise.all(beforeLocations.map(location =>
      _load(location, undefined, this._kernel, session, timeout)))

    // Generate the refmap from those input creations
    this._refmap = Commit._buildRefmapForIncoming(beforeCreations, timeout)
    return this._refmap
  }

  // --------------------------------------------------------------------------

  static async _buildRefmapForIncoming (incoming, timeout) {
    if (Log._debugOn) Log._debug(TAG, 'Build refmap')

    const Creation = require('./creation')
    const refmap = {}

    // Map all inner origins to locations
    _sudo(() => _deepVisit(incoming, x => {
      if (x instanceof Creation) {
        _sudo(() => {
          if (!(x.origin in refmap) || refmap[x.origin][1] <= x.nonce) {
            refmap[x.origin] = [x.location, x.nonce]
          }
        })

        // Don't traverse deeply. Deep references are not part of a creation's state.
        // They should not contribute towards the refmap used to capture state nor
        // to the unification with other creations.
        return incoming.includes(x)
      }
    }))

    return refmap
  }

  // --------------------------------------------------------------------------

  /**
   * Called by the publisher on success
   */
  _onPublishSucceed () {
    // Mark published
    this._published = true

    // Notify listeners
    this._publishListeners.forEach(s => s.resolve())
    this._publishListeners = []

    // Notify downstream commits to start publishing
    this._downstream.forEach(commit => commit._onUpstreamPublished(this))

    // Emit publish events
    const emitPublishEvent = creation => {
      if (!this._spentDownstream(creation)) {
        this._kernel._emit('publish', creation)
      }
    }
    this._record._outputs._forEach(creation => emitPublishEvent(creation))
    this._record._deletes._forEach(creation => emitPublishEvent(creation))

    // Clear our downstream
    this._downstream = []

    // Mark not publishing anymore
    this._setPublishing(false)
  }

  // --------------------------------------------------------------------------

  /**
   * Called by the publisher on error
   */
  _onPublishFail (e) {
    _assert(e)

    const record = this._record

    // Mark not published
    this._published = false

    // Notify downstream commits, which will roll them back
    this._downstream.forEach(commit => commit._onPublishFail(e))
    this._downstream = []

    const unhandled = e && this._publishListeners.length === 0

    if (Log._errorOn) Log._error(TAG, unhandled ? 'Unhandled' : '', e)

    // Rollback the creations
    this._record._rollback(e)

    // If unhandled, all outputs and deleted have the error
    if (unhandled) {
      const errorLocation = _compileLocation({ _error: `Unhandled ${e}` })

      _sudo(() => {
        record._outputs._forEach(creation => { creation.location = errorLocation })
        record._deletes._forEach(creation => { creation.location = errorLocation })
      })
    }

    // Notify of the rollback
    if (!record._replaying) {
      record._outputs._forEach(creation => this._kernel._emit('update', creation))
      record._deletes._forEach(creation => this._kernel._emit('update', creation))
    }

    // Notify sync listeners of the failure if it is a failure
    if (e) {
      this._publishListeners.forEach(listener => listener.reject(e))
      this._publishListeners = []
    }

    // Mark not publishing anymore
    this._setPublishing(false)
  }
}

// ------------------------------------------------------------------------------------------------
// _get
// ------------------------------------------------------------------------------------------------

/**
 * Looks up a commit being published from its commit id
 */
Commit._findPublishing = id => {
  return COMMITS_PUBLISHING.get(id)
}

// ------------------------------------------------------------------------------------------------
// _sync
// ------------------------------------------------------------------------------------------------

/**
 * Waits for all current commits to finish publishing
 */
Commit._syncAll = async () => {
  const promises = []
  for (const commit of COMMITS_PUBLISHING.values()) {
    promises.push(commit._onPublish())
  }
  return Promise.all(promises)
}

// ------------------------------------------------------------------------------------------------

module.exports = Commit
