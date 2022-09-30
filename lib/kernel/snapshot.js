/**
 * snapshot.js
 *
 * A savepoint for a jig, code, or berry so that it can be rolled back if necessary
 * or evolve in a parallel update in the case of a read.
 *
 * This is not the same as the state, because snapshots are of live creations, but
 * snapshots can be converted into states.
 *
 * Snapshots can be created in bindingsOnly mode, which will only save location,
 * owner, etc. and not all deep properties, or they can capture a creation completely.
 * bindingsOnly mode is an optimization when we are only reading a jig and don't need
 * to worry about a rollback but still want to capture its identifying information.
 * bindingsOnly mode may also be used if rollbacks are disabled in the kernel.
 */

const { _text, _setOwnProperty } = require('./misc')
const { _deepClone } = require('./deep')
const { _sudo } = require('./admin')
const { _UNDEPLOYED_LOCATION, _compileLocation } = require('./bindings')
const SI = require('./sandbox')._intrinsics
const Log = require('./log')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Snapshot'

// ------------------------------------------------------------------------------------------------
// Snapshot
// ------------------------------------------------------------------------------------------------

class Snapshot {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a savepoint for a creation
   * @param {Creation} creation Jig, code or berry to save
   * @param {boolean} bindingsOnly Whether to only capture location and other bindings and not all state
   * @param {boolean} disableRollback Whether the snapshot will not be rolled back
   */
  constructor (creation, bindingsOnly, disableRollback) {
    if (Log._debugOn) Log._debug(TAG, 'Snapshot', _text(creation), bindingsOnly ? '(bindings only)' : '')

    this._creation = creation
    this._bindingsOnly = bindingsOnly
    this._rollbackEnabled = !disableRollback

    // If we are only capturing bindings, get them an return
    if (bindingsOnly) {
      const props = this._props = {}
      _sudo(() => {
        props.location = creation.location
        props.origin = creation.origin
        props.nonce = creation.nonce
        props.owner = _deepClone(creation.owner, SI)
        props.satoshis = creation.satoshis
      })
      return
    }

    // Otherwise, capture all properties
    this._captureCompletely()
  }

  // --------------------------------------------------------------------------
  // _captureCompletely
  // --------------------------------------------------------------------------

  /**
   * Capture all states for a jig. This is used if we had previously only captured bindings.
   */
  _captureCompletely () {
    const creation = this._creation

    this._bindingsOnly = false
    this._rollbackEnabled = true

    // Lazy dependencies for linking reasons
    const Jig = require('./jig')
    const Code = require('./code')
    const Berry = require('./berry')
    const Editor = require('./editor')

    // Get the creation type
    if (creation instanceof Jig) {
      this._kind = 'jig'
    } else if (creation instanceof Code) {
      this._kind = Editor._get(creation)._native ? 'native' : 'code'
    } else if (creation instanceof Berry) {
      this._kind = 'berry'
    } else {
      throw new Error(`Not a creation: ${_text(creation)}`)
    }

    // Save the properties of the creation
    _sudo(() => {
      const props = Object.assign({}, creation)
      const clonedProps = _deepClone(props, SI)
      this._props = clonedProps
    })

    // Save the class
    if (this._kind === 'jig' || this._kind === 'berry') {
      this._cls = _sudo(() => creation.constructor)
    }

    // Save the source code and inner type
    if (this._kind === 'code') {
      const editor = Editor._get(creation)
      this._src = editor._src
      this._savepoint = editor._save()
    }
  }

  // --------------------------------------------------------------------------
  // _rollback
  // --------------------------------------------------------------------------

  /**
   * Reverts the creation to the snapshot point if _rollbackEnabled is true
   * @param {?Error} e The error that caused the rollback if available
   */
  _rollback (e) {
    // Native code cannot be rolled back
    if (this._kind === 'native') return

    // If the snapshot is not for rolling back, skip
    if (!this._rollbackEnabled) return

    return _sudo(() => {
      // If we are only storing bindings, then we go into an error state
      if (this._bindingsOnly) {
        if (e) {
          const errorLocation = _compileLocation({ _error: `A previous error occurred\n\n${e}` })
          _setOwnProperty(this._creation, 'location', errorLocation)
        } else {
          _setOwnProperty(this._creation, 'location', _UNDEPLOYED_LOCATION)
        }
        return
      }

      // Restore the code for the class
      if (this._kind === 'code') {
        const Editor = require('./editor')
        const editor = Editor._get(this._creation)
        editor._restore(this._savepoint)
      }

      // Delete each existing owned property
      Object.keys(this._creation).forEach(key => { delete this._creation[key] })

      // Assign each new property as an owned property. Owned is important.
      Object.keys(this._props).forEach(key => {
        _setOwnProperty(this._creation, key, this._props[key])
      })

      // For undeployed creations, a rollback is unrecoverable. Code can be redeployed.
      if (e) {
        const Jig = require('./jig')
        const Code = require('./code')

        if ((this._creation instanceof Jig || this._creation instanceof Code) &&
          this._props.location === _UNDEPLOYED_LOCATION) {
          const errorLocation = _compileLocation({ _error: `Deploy failed\n\n${e}` })
          _setOwnProperty(this._creation, 'origin', errorLocation)
          _setOwnProperty(this._creation, 'location', errorLocation)
        }
      }
    })
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Snapshot
