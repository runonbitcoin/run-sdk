/**
 * inventory.js
 *
 * An object that tracks the jigs and code for the current owner
 */

const Log = require('../kernel/log')
const { _owner } = require('../kernel/bindings')
const { _text, _Timeout } = require('../kernel/misc')
const { _sudo } = require('../kernel/admin')
const { TimeoutError } = require('../kernel/error')
const { _RequestError } = require('./request')
const LocalOwner = require('./local-owner')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Inventory'

// ------------------------------------------------------------------------------------------------
// Inventory
// ------------------------------------------------------------------------------------------------

class Inventory {
  constructor () {
    this._listener = (event, data) => this._detect(data)
    this._creations = []
  }

  // --------------------------------------------------------------------------
  // attach
  // --------------------------------------------------------------------------

  attach (run) {
    this.detach()

    if (Log._debugOn) Log._debug(TAG, 'Attach')
    this._run = run

    run.on('update', this._listener)
    run.on('publish', this._listener)
    run.on('sync', this._listener)

    this._lock = null
    this._pending = []

    if (run.owner instanceof LocalOwner) {
      this._lock = _owner(run.owner.address)
    }
  }

  // --------------------------------------------------------------------------
  // detach
  // --------------------------------------------------------------------------

  detach (run) {
    if (!this._run) return

    if (Log._debugOn) Log._debug(TAG, 'Detach')

    this._run.off('update', this._listener)
    this._run.off('publish', this._listener)
    this._run.off('sync', this._listener)

    this._run = null
    this._lock = null
    this._pending = null
  }

  // --------------------------------------------------------------------------
  // jigs
  // --------------------------------------------------------------------------

  get jigs () {
    this._filterNotOurs()
    const Jig = require('../kernel/jig')
    return this._creations.filter(x => x instanceof Jig)
  }

  // --------------------------------------------------------------------------
  // code
  // --------------------------------------------------------------------------

  get code () {
    this._filterNotOurs()
    const Code = require('../kernel/code')
    return this._creations.filter(x => x instanceof Code)
  }

  // --------------------------------------------------------------------------
  // sync
  // --------------------------------------------------------------------------

  async sync () {
    if (Log._infoOn) Log._info(TAG, 'Sync')

    // Get the initial lock
    if (!this._lock) {
      try {
        if (!this._run || !this._run._kernel._owner.nextOwner) {
          throw new Error('Inventory cannot determine owner')
        }
        const owner = await this._run._kernel._owner.nextOwner()
        this._lock = _owner(owner)
        if (Log._debugOn) Log._debug(TAG, 'Owner', owner)
        if (this._pending) this._pending.forEach(creation => this._detect(creation))
      } finally {
        this._pending = null
      }
    }

    // Make sure we have a lock
    if (!this._lock) return

    // One sync at a time
    if (this._sync) return this._sync

    // Lock if off and return the promise
    this._sync = this._syncLatest()
      .then(() => { this._sync = null })
      .catch(e => { this._sync = null; throw e })

    return this._sync
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  async _syncLatest () {
    let locations

    // If we can get locations to load from our state API, do that instead of
    // UTXOs, as there is no risk of non-jigs in that. Otherwise, use utxos.
    if (typeof this._run.state.locations === 'function') {
      const script = this._lock.script()
      locations = await this._run.state.locations(script)
    } else {
      const script = this._lock.script()
      const utxos = await this._run.blockchain.utxos(script)
      locations = utxos.map(utxo => `${utxo.txid}_o${utxo.vout}`)
    }

    // Get current locations of creations in the inventory
    const existingLocations = _sudo(() => this._creations.map(creation => creation.location))

    // Create a shared load session and a shared timeout
    const _load = require('../kernel/load')
    const session = new _load._Session()
    const timeout = new _Timeout('inventory sync', this._run._kernel._timeout)

    // Add all new creations we don't know about
    for (const location of locations) {
      // Keep existing creations in the inventory when there are no updates
      if (existingLocations.includes(location)) continue

      // Try loading the creation, but if it fails to load, just move on to the next.
      // Otherwise, baddies might crash apps by sending users creations that don't load.
      let creation = null
      try {
        creation = await _load(location, undefined, this._run._kernel, session, timeout)
      } catch (e) {
        // Timeout and Request errors are intermittent errors and should not be swalloed
        if (e instanceof TimeoutError) throw e
        if (e instanceof _RequestError) throw e

        // Assume all other errors are due to non-creation utxos or other invalid transactions
        if (Log._warnOn) Log._warn(TAG, `Failed to load ${location}\n\n${e.toString()}`)
        continue
      }

      this._detect(creation)
    }

    // Remove creations that are not ours
    this._filterNotOurs()
  }

  // --------------------------------------------------------------------------

  _detect (creation) {
    // If we don't have a lock yet, add this creation to a pending set to redetect once there's an owner
    // We will run the remaining detection because if owner is undefined, it will be ours.
    if (!this._lock && this._pending) this._pending.push(creation)

    // If there is an existing creation, prefer the newer one
    const existing = this._creations.find(x => this._sameOrigin(x, creation))
    if (existing && _sudo(() => existing.nonce > creation.nonce)) return

    // Remove the existing creation. We will prefer our new one.
    this._creations = this._creations.filter(x => x !== existing)

    if (this._ours(creation)) {
      if (!existing && Log._infoOn) Log._info(TAG, 'Add', _text(creation))
      this._creations.push(creation)
    } else {
      if (existing && Log._infoOn) Log._info(TAG, 'Remove', _text(creation))
    }
  }

  // --------------------------------------------------------------------------

  _sameOrigin (x, y) {
    if (x === y) return true
    const xOrigin = _sudo(() => x.origin)
    const yOrigin = _sudo(() => y.origin)
    if (xOrigin.startsWith('error://')) return false
    if (yOrigin.startsWith('error://')) return false
    return xOrigin === yOrigin
  }

  // --------------------------------------------------------------------------

  _ours (creation) {
    try {
      // Errored creations are not owned because they can't be used
      if (_sudo(() => creation.location).startsWith('error://')) return false

      // Assume creations with undefined owners will become ours
      const creationOwner = _sudo(() => creation.owner)
      if (typeof creationOwner === 'undefined') return true

      // If we don't have a lock, and its owned by another, its not ours
      if (!this._lock) return false

      // Otherwise, check the scripts that will be generated
      const creationLock = _owner(creationOwner)
      const creationScript = creationLock.script()
      const ourScript = this._lock.script()
      return creationScript === ourScript
    } catch (e) {
      return false
    }
  }

  // --------------------------------------------------------------------------

  _filterNotOurs () {
    this._creations = this._creations.filter(creation => {
      if (this._ours(creation)) return true
      if (Log._infoOn) Log._info(TAG, 'Remove', _text(creation))
      return false
    })
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Inventory
