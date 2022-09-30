/**
 * creation-set.js
 *
 * A ordered set that can quickly check for the existance of creations used in a transaction
 */

const { _sudo } = require('./admin')
const { _assert, _text } = require('./misc')

// ------------------------------------------------------------------------------------------------
// CreationSet
// ------------------------------------------------------------------------------------------------

class CreationSet {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor () {
    this._creations = new Set()
    this._deployed = new Map() // origin -> Creation
    this._array = null
  }

  // --------------------------------------------------------------------------
  // _add
  // --------------------------------------------------------------------------

  _add (x) {
    // If we already have it, then stop
    if (this._creations.has(x)) {
      return
    }

    // Ensure it is a creation
    const Creation = require('./creation')
    _assert(x instanceof Creation)

    // If its not deployed yet, and we don't have it, add it
    const xOrigin = _sudo(() => x.origin)
    if (xOrigin.startsWith('error://') || xOrigin.startsWith('record://')) {
      this._creations.add(x)
      this._array = null
      return
    }

    // Check if there is an existing jig, that it has the same location
    const y = this._deployed.get(xOrigin)
    if (y) {
      const xLocation = _sudo(() => x.location)
      const yLocation = _sudo(() => y.location)
      if (xLocation !== yLocation) {
        const xinfo = `${_text(x)}: ${xLocation}`
        const yinfo = `${_text(y)}: ${yLocation}`
        throw new Error(`Inconsistent worldview\n\n${xinfo}\n${yinfo}`)
      }
      return
    }

    // The jig doesn't exist. Add it.
    this._creations.add(x)
    this._deployed.set(xOrigin, x)
    this._array = null
  }

  // --------------------------------------------------------------------------
  // _delete
  // --------------------------------------------------------------------------

  _delete (x) {
    // If we have this exact creation, remove it
    if (this._creations.has(x)) {
      const xOrigin = _sudo(() => x.origin)
      this._deployed.delete(xOrigin)
      this._creations.delete(x)
      this._array = null
    }

    // Ensure it is a creation
    const Creation = require('./creation')
    _assert(x instanceof Creation)

    // If its not deployed yet, then we don't have it
    const xOrigin = _sudo(() => x.origin)
    if (xOrigin.startsWith('error://') || xOrigin.startsWith('record://')) {
      return
    }

    // If we have another of the same origin, delete it
    const y = this._deployed.get(xOrigin)
    if (!y) return

    const xLocation = _sudo(() => x.location)
    const yLocation = _sudo(() => y.location)
    if (xLocation !== yLocation) {
      const xinfo = `${_text(x)}: ${xLocation}`
      const yinfo = `${_text(y)}: ${yLocation}`
      throw new Error(`Inconsistent worldview\n\n${xinfo}\n${yinfo}`)
    }

    this._creations.delete(y)
    this._deployed.delete(xOrigin)
    this._array = null
  }

  // --------------------------------------------------------------------------
  // _has
  // --------------------------------------------------------------------------

  _has (x) {
    // If we have this exact creation, return true
    if (this._creations.has(x)) return true

    // Ensure it is a creation
    const Creation = require('./creation')
    if (!(x instanceof Creation)) return false

    // If its not deployed yet, then we don't have it
    const xOrigin = _sudo(() => x.origin)
    if (xOrigin.startsWith('error://') || xOrigin.startsWith('record://')) {
      return false
    }

    // Check if we have another creation with the same origin
    const y = this._deployed.get(xOrigin)
    if (!y) return false

    const xLocation = _sudo(() => x.location)
    const yLocation = _sudo(() => y.location)
    if (xLocation !== yLocation) {
      const xinfo = `${_text(x)}: ${xLocation}`
      const yinfo = `${_text(y)}: ${yLocation}`
      throw new Error(`Inconsistent worldview\n\n${xinfo}\n${yinfo}`)
    }

    return true
  }

  // --------------------------------------------------------------------------
  // _get
  // --------------------------------------------------------------------------

  _get (x) {
    // If we have this exact creation, return true
    if (this._creations.has(x)) return x

    // Ensure it is a creation
    const Creation = require('./creation')
    if (!(x instanceof Creation)) return undefined

    // If its not deployed yet, then we don't have it
    const xOrigin = _sudo(() => x.origin)
    if (xOrigin.startsWith('error://') || xOrigin.startsWith('record://')) {
      return undefined
    }

    // Check if we have another creation with the same origin
    const y = this._deployed.get(xOrigin)
    if (!y) return undefined

    const xLocation = _sudo(() => x.location)
    const yLocation = _sudo(() => y.location)
    if (xLocation !== yLocation) {
      const xinfo = `${_text(x)}: ${xLocation}`
      const yinfo = `${_text(y)}: ${yLocation}`
      throw new Error(`Inconsistent worldview\n\n${xinfo}\n${yinfo}`)
    }

    return y
  }

  // --------------------------------------------------------------------------
  // _forEach
  // --------------------------------------------------------------------------

  _forEach (f) {
    let i = 0
    for (const jig of this._creations) {
      f(jig, i++)
    }
  }

  // --------------------------------------------------------------------------
  // _arr
  // --------------------------------------------------------------------------

  _arr () {
    this._array = this._array || Array.from(this._creations)
    return this._array
  }

  // --------------------------------------------------------------------------
  // _size
  // --------------------------------------------------------------------------

  get _size () {
    return this._creations.size
  }

  // --------------------------------------------------------------------------
  // [Symbol.iterator]
  // --------------------------------------------------------------------------

  [Symbol.iterator] () {
    return this._creations[Symbol.iterator]()
  }

  // --------------------------------------------------------------------------
  // static _sameCreation
  // --------------------------------------------------------------------------

  static _sameCreation (x, y) {
    const Creation = require('./creation')
    if (!(x instanceof Creation)) return false
    if (!(y instanceof Creation)) return false

    if (x === y) return true

    const { _location } = require('./bindings')
    return _sudo(() => {
      if (_location(x.origin)._error) return false
      if (_location(y.origin)._error) return false

      if (x.origin !== y.origin) return false

      if (x.location !== y.location) {
        const xinfo = `${_text(x)}: ${x.location}`
        const yinfo = `${_text(y)}: ${y.location}`
        throw new Error(`Inconsistent worldview\n\n${xinfo}\n${yinfo}`)
      }

      return true
    })
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = CreationSet
