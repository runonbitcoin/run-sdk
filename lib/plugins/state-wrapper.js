/**
 * state-wrapper.js
 *
 * Base class for a State implementation that adds the following functionality:
 *
 *    - Log calls
 *    - Log performance in debug mode
 *    - Verify the API responses
 *    - Allows paying without providing parents
 *    - Cache state locally
 *    - Query the local cache before making a server call
 *
 * This allows the implementation to just focus on making API calls.
 */

const bsv = require('bsv')
const { _text } = require('../kernel/misc')
const Log = require('../kernel/log')
const StateFilter = require('./state-filter')
const LocalCache = require('./local-cache')

// ------------------------------------------------------------------------------------------------
// StateWrapper
// ------------------------------------------------------------------------------------------------

class StateWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (state = this, cache = new LocalCache()) {
    this.tag = state.constructor.name === 'Object' ? 'State' : state.constructor.name

    this.cache = cache

    this.unwrappedState = state
    this.unwrappedPull = state.pull
    this.unwrappedBroadcast = state.broadcast
    this.unwrappedLocations = state.locations

    this.setWrappingEnabled(true)
  }

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  setWrappingEnabled (enabled) {
    if (enabled) {
      this.pull = StateWrapper.prototype.wrappedPull
      this.broadcast = this.unwrappedBroadcast && StateWrapper.prototype.wrappedBroadcast
      this.locations = this.unwrappedLocations && StateWrapper.prototype.wrappedLocations
    } else {
      this.pull = this.unwrappedPull
      this.broadcast = this.unwrappedBroadcast
      this.locations = this.unwrappedLocations
    }
  }

  // ------------------------------------------------------------------------
  // wrappedPull
  // ------------------------------------------------------------------------

  async wrappedPull (key, options) {
    // Check that the key is valid
    if (typeof key !== 'string' || !key.length) throw new Error(`Invalid key: ${_text(key)}`)

    // Check the the options are valid
    if (typeof options !== 'undefined' && !(typeof options === 'object' && options)) throw new Error(`Invalid options: ${_text(options)}`)

    options = options || {}

    // Check if we have it in the cache
    const cachedValue = this.cache && await this.cache.get(key)
    if (typeof cachedValue !== 'undefined') return cachedValue

    // If we are making an API call, changes the options to filter out what we already have
    if (!options.filter) {
      const codeFilter = await this.cache.get('config://code-filter')
      if (codeFilter) options.filter = StateFilter.toBase64(codeFilter)
    }

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Pull', key, _text(options))
    const start = new Date()
    const value = await this.unwrappedPull.call(this.unwrappedState, key, options)
    if (Log._debugOn) Log._debug(this.tag, 'Pull (end): ' + (new Date() - start) + 'ms')

    // We intentionally check for truthy. Trust will return true/false, and we don't want
    // to set false in our local cache to allow for changes in the Run-DB instance.
    if (value && this.cache) {
      await this.cache.set(key, value)
    }

    return value
  }

  // ------------------------------------------------------------------------
  // wrappedLocations
  // ------------------------------------------------------------------------

  async wrappedLocations (script) {
    // Allow the user to pass an address, or bsv objects
    if (typeof script === 'string') {
      try {
        script = bsv.Script.fromAddress(script).toHex()
      } catch (e) {
        try {
          script = new bsv.Script(script).toHex()
        } catch (e2) {
          throw new Error(`Invalid script: ${_text(script)}`)
        }
      }
    } else if (script instanceof bsv.Address) {
      script = bsv.Script.fromAddress(script).toHex()
    } else if (script instanceof bsv.Script) {
      script = script.toHex()
    } else {
      throw new Error(`Invalid script: ${_text(script)}`)
    }

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Locations', script)
    const start = new Date()
    let locations = await this.unwrappedLocations.call(this.unwrappedState, script)
    if (Log._debugOn) Log._debug(this.tag, 'Trusted (end): ' + (new Date() - start) + 'ms')

    // Check the response
    if (!Array.isArray(locations) || locations.some(location => typeof location !== 'string')) {
      throw new Error(`Received invalid locations: ${_text(locations)}`)
    }

    // Filter out duplicates
    const locationSet = new Set()
    locations = locations.filter(location => {
      if (!locationSet.has(location)) {
        locationSet.add(location)
        return true
      } else {
        if (Log._warnOn) Log._warn(this.tag, 'Duplicate utxo returned from server:', location)
        return false
      }
    })

    return locations
  }

  // ------------------------------------------------------------------------
  // wrappedBroadcast
  // ------------------------------------------------------------------------

  async wrappedBroadcast (rawtx) {
    if (typeof rawtx !== 'string' || !rawtx.length) {
      throw new Error(`Invalid rawtx: ${_text(rawtx)}`)
    }

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Broadcast')
    const start = new Date()
    await this.unwrappedBroadcast.call(this.unwrappedState, rawtx)
    if (Log._debugOn) Log._debug(this.tag, 'Broadcast (end): ' + (new Date() - start) + 'ms')
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = StateWrapper
