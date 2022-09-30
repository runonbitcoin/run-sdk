/**
 * whatsonchain.js
 *
 * WhatsOnChain Blockchain API
 */

const { _scripthash } = require('../kernel/bsv')
const Log = require('../kernel/log')
const { NotImplementedError } = require('../kernel/error')
const request = require('./request')
const BlockchainWrapper = require('./blockchain-wrapper')
const { _RequestError } = request

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'WhatsOnChain'

// ------------------------------------------------------------------------------------------------
// WhatsOnChain
// ------------------------------------------------------------------------------------------------

class WhatsOnChain extends BlockchainWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  /**
   * @param {?object} options Optional configurations options
   * @param {?string} options.apiKey API key
   * @param {?string} options.network Network string. Defaults to main.
   */
  constructor (options = {}) {
    super()

    this.api = 'whatsonchain'
    this.apiKey = _parseApiKey(options.apiKey)
    this.network = _parseNetwork(options.network)
    this.request = request
  }

  // --------------------------------------------------------------------------
  // Blockchain API
  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    const url = `https://api.whatsonchain.com/v1/bsv/${this.network}/tx/raw`
    const headers = this.apiKey ? { 'woc-api-key': this.apiKey } : {}
    const options = { method: 'POST', body: { txhex: rawtx }, headers }
    const txid = await this.request(url, options)
    return txid
  }

  // --------------------------------------------------------------------------

  async fetch (txid) {
    try {
      const url = `https://api.whatsonchain.com/v1/bsv/${this.network}/tx/${txid}/hex`
      const headers = this.apiKey ? { 'woc-api-key': this.apiKey } : {}
      const options = { headers, cache: 1000 }
      const json = await this.request(url, options)
      return json
    } catch (e) {
      if (e instanceof _RequestError && (e.status === 404 || e.status === 500)) {
        throw new Error('No such mempool or blockchain transaction')
      } else {
        throw e
      }
    }
  }

  // --------------------------------------------------------------------------

  async utxos (script) {
    if (this.network === 'stn') {
      if (Log._warnOn) Log._warn(TAG, 'Utxos are not available on STN')
      return []
    }

    const scripthash = await _scripthash(script)
    const url = `https://api.whatsonchain.com/v1/bsv/${this.network}/script/${scripthash}/unspent`
    const headers = this.apiKey ? { 'woc-api-key': this.apiKey } : {}
    const data = await this.request(url, { headers, cache: 1000 })
    const utxos = data.map(o => { return { txid: o.tx_hash, vout: o.tx_pos, satoshis: o.value, script } })
    return utxos
  }

  // --------------------------------------------------------------------------

  async time (txid) {
    try {
      const url = `https://api.whatsonchain.com/v1/bsv/${this.network}/tx/hash/${txid}`
      const headers = this.apiKey ? { 'woc-api-key': this.apiKey } : {}
      const options = { headers, cache: 1000 }
      const json = await this.request(url, options)
      return json.time * 1000 || Date.now()
    } catch (e) {
      if (e instanceof _RequestError && (e.status === 404 || e.status === 500)) {
        throw new Error('No such mempool or blockchain transaction')
      } else {
        throw e
      }
    }
  }

  // --------------------------------------------------------------------------

  async spends (txid, vout) {
    throw new NotImplementedError('WhatsOnChain API does not support spends')
  }
}

// ------------------------------------------------------------------------------------------------
// Parameter validation
// ------------------------------------------------------------------------------------------------

function _parseApiKey (apiKey) {
  if (typeof apiKey === 'undefined' || typeof apiKey === 'string') return apiKey
  throw new Error(`Invalid API key: ${apiKey}`)
}

// ------------------------------------------------------------------------------------------------

function _parseNetwork (network) {
  if (typeof network === 'undefined') return 'main'
  if (typeof network !== 'string') throw new Error(`Invalid network: ${network}`)
  if (network !== 'main' && network !== 'test' && network !== 'stn') throw new Error(`WhatsOnChain API does not support the "${network}" network`)
  return network
}

// ------------------------------------------------------------------------------------------------

module.exports = WhatsOnChain
