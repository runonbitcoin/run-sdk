/**
 * run-connect.js
 *
 * Run Connect Blockchain API that can be used as both a Blockchain implementation
 */

const { _scripthash } = require('../kernel/bsv')
const request = require('./request')
const BlockchainWrapper = require('./blockchain-wrapper')
const { _RequestError } = request

// ------------------------------------------------------------------------------------------------
// RunConnect
// ------------------------------------------------------------------------------------------------

class RunConnect extends BlockchainWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  /**
   * @param {?object} options Optional configurations options
   * @param {?string} options.network Network string. Defaults to main.
   */
  constructor (options = {}) {
    super()

    this.api = 'run'
    this.network = _parseNetwork(options.network)
    this.request = request
    this.host = 'https://api.run.network'
  }

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    const url = `${this.host}/v1/${this.network}/tx`
    const options = { method: 'POST', body: { rawtx } }
    const txid = await this.request(url, options)
    return txid
  }

  // --------------------------------------------------------------------------
  // fetch
  // --------------------------------------------------------------------------

  async fetch (txid) {
    const url = `${this.host}/v1/${this.network}/rawtx/${txid}`
    const resp = await this.request(url)
    return resp.toString('hex')
  }

  // --------------------------------------------------------------------------
  // utxos
  // --------------------------------------------------------------------------

  async utxos (script) {
    const scripthash = await _scripthash(script)
    const url = `${this.host}/v1/${this.network}/utxos/${scripthash}`
    const utxos = await this.request(url, { cache: 1000 })
    return utxos
  }

  // --------------------------------------------------------------------------
  // time
  // --------------------------------------------------------------------------

  async time (txid) {
    const url = `${this.host}/v1/${this.network}/tx/${txid}`
    const options = { cache: 1000 }
    const json = await this.request(url, options)
    if (this.cache) {
      const cacheSets = []
      cacheSets.push(this.cache.set(`tx://${txid}`, json.hex))
      json.vout.forEach((x, n) => { if (x.spentTxId) cacheSets.push(this.cache.set(`spend://${txid}_o${n}`, x.spentTxId)) })
      await Promise.all(cacheSets)
    }
    return json.time * 1000 || Date.now()
  }

  // --------------------------------------------------------------------------
  // spends
  // --------------------------------------------------------------------------

  async spends (txid, vout) {
    try {
      const url = `${this.host}/v1/${this.network}/spends/${txid}_o${vout}`
      const json = await this.request(url)
      return json.spentTxId
    } catch (e) {
      if (e instanceof _RequestError && e.status === 404) return null
      throw e
    }
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

module.exports = RunConnect
