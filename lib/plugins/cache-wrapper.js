/**
 * cache-wrapper.js
 *
 * Wraps a Run Cache implementation to add common functionality:
 *
 *    - Logging calls
 *    - Logging performance
 *    - Validating arguments and responses
 *    - Ensuring immutable entries don't change
 *    - Updating the config://code-filter key
 *
 * To use, either wrap a cache instance:
 *
 *    new CacheWrapper(myCache)
 *
 * or extend your class from it:
 *
 *    class MyCache extends CacheWrapper { ... }
 */

const Log = require('../kernel/log')
const StateFilter = require('./state-filter')
const { _deepEqual } = require('../kernel/deep')
const { _text, _basicObject, _basicArray } = require('../kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const IMMUTABLE_KEYS = ['jig', 'berry', 'tx']

// ------------------------------------------------------------------------------------------------
// CacheWrapper
// ------------------------------------------------------------------------------------------------

class CacheWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (cache = this) {
    this.tag = cache.constructor.name === 'Object' ? 'Cache' : cache.constructor.name

    this.unwrappedCache = cache
    this.unwrappedGet = cache.get
    this.unwrappedSet = cache.set

    this.setWrappingEnabled(true)
  }

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  setWrappingEnabled (enabled) {
    if (enabled) {
      this.get = CacheWrapper.prototype.wrappedGet
      this.set = CacheWrapper.prototype.wrappedSet
    } else {
      this.get = this.unwrappedGet
      this.set = this.unwrappedSet
    }
  }

  // --------------------------------------------------------------------------
  // wrappedGet
  // --------------------------------------------------------------------------

  async wrappedGet (key) {
    // Check the key is valid
    if (typeof key !== 'string' || !key.length) throw new Error(`Invalid key: ${_text(key)}`)

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Get', key)
    const start = new Date()
    const value = await this.unwrappedGet.call(this.unwrappedCache, key)
    if (Log._debugOn) Log._debug(this.tag, 'Get (end): ' + (new Date() - start) + 'ms')
    if (Log._debugOn) Log._debug(this.tag, 'Value:', JSON.stringify(value, 0, 3))

    // Check the response
    if (typeof value !== 'undefined' && !_isJson(value)) throw new Error(`Invalid value retrieved for ${key}: ${value}`)

    return value
  }

  // ------------------------------------------------------------------------
  // wrappedSet
  // ------------------------------------------------------------------------

  async wrappedSet (key, value) {
    // Check the key is valid
    if (typeof key !== 'string' || !key.length) throw new Error(`Invalid key: ${_text(key)}`)

    // Check the value is JSON
    if (!_isJson(value)) throw new Error(`Cannot cache ${_text(value)}`)

    // If we are overwriting an immutable previous value, check that the values are the same.
    const immutable = IMMUTABLE_KEYS.includes(key.split('://')[0])
    if (immutable) {
      const previousValue = await this.unwrappedGet.call(this.unwrappedCache, key)
      if (typeof previousValue !== 'undefined' && !_deepEqual(value, previousValue)) {
        if (Log._errorOn) Log._error(this.tag, 'Expected:', JSON.stringify(previousValue, 0, 3))
        if (Log._errorOn) Log._error(this.tag, 'Actual:', JSON.stringify(value, 0, 3))

        const hint = 'This is an internal Run bug. Please report it to the library developers.'
        throw new Error(`Attempt to set different values for the same key: ${key}\n\n${hint}`)
      }
    }

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Set', key)
    if (Log._debugOn) Log._debug(this.tag, 'Value:', JSON.stringify(value, 0, 3))
    const start = new Date()
    const ret = await this.unwrappedSet.call(this.unwrappedCache, key, value)
    if (Log._debugOn) Log._debug(this.tag, 'Set (end): ' + (new Date() - start) + 'ms')

    // Update the code filter
    if (key.startsWith('jig://') && value.kind === 'code') {
      const filter = await this.unwrappedGet.call(this.unwrappedCache, 'config://code-filter') || StateFilter.create()
      StateFilter.add(filter, key)
      await this.unwrappedSet.call(this.unwrappedCache, 'config://code-filter', filter)
    }

    return ret
  }
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function _isJson (x) {
  switch (typeof x) {
    case 'undefined': return false
    case 'boolean': return true
    case 'number': return Number.isFinite(x)
    case 'string': return true
    case 'object': {
      if (x === null) return true
      if (_basicObject(x)) return !Object.keys(x).some(key => !_isJson(x[key]))
      if (_basicArray(x)) return x.length === Object.keys(x).length && !Object.keys(x).some(key => !_isJson(x[key]))
      return false
    }
    case 'function': return false
    case 'symbol': return false
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = CacheWrapper
