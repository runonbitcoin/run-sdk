/**
 * state-server.js
 *
 * Run Connect State API that can be used as a State implementation
 */

const request = require('./request')
const StateFilter = require('./state-filter')
const StateWrapper = require('./state-wrapper')

// ------------------------------------------------------------------------------------------------
// StateServer
// ------------------------------------------------------------------------------------------------

class StateServer extends StateWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  /**
   * @param {?object} options Optional configurations options
   * @param {?string} options.network Network string. Defaults to main.
   */
  constructor (options = {}) {
    super()

    this.network = _parseNetwork(options.network)
    this.request = request
    this.host = 'https://api.run.network'
  }

  // --------------------------------------------------------------------------
  // pull
  // --------------------------------------------------------------------------

  async pull (key, options) {
    let states = {}
    let error = null

    // Our API only returns creation states
    const [protocol, location] = key.split('://')
    if (protocol !== 'jig' && protocol !== 'berry') return

    // Call the API
    try {
      options = options || {}
      const all = options.all ? 1 : 0
      const tx = options.tx ? 1 : 0
      const filter = options.filter || StateFilter.toBase64(StateFilter.create())
      const url = `${this.host}/v1/${this.network}/state/${encodeURIComponent(location)}?all=${all}&tx=${tx}&filter=${filter}`
      const requestOptions = { cache: 1000 }
      states = await this.request(url, requestOptions)
    } catch (e) {
      // Even if the state is missing, transaction data might still be present
      states = typeof e.reason === 'object' ? e.reason : {}
      if (e.status !== 404) error = e
    }

    // Cache the states, except for the one we requested, because StateWrapper will cache that
    if (this.cache) {
      await Promise.all(
        Object.entries(states)
          .filter(([k, _]) => k !== key)
          .map(([k, v]) => this.cache.set(k, v))
      )
    }

    // Throw any errors after caching
    if (error) throw error

    // Return the one state we requested
    return states[key]
  }
}

// ------------------------------------------------------------------------------------------------
// Parameter validation
// ------------------------------------------------------------------------------------------------

function _parseNetwork (network) {
  if (typeof network === 'undefined') return 'main'
  if (typeof network !== 'string') throw new Error(`Invalid network: ${network}`)
  if (network !== 'main' && network !== 'test') throw new Error(`RunConnect API does not support the "${network}" network`)
  return network
}

// ------------------------------------------------------------------------------------------------

module.exports = StateServer
