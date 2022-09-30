/**
 * pay-server.js
 *
 * API to connect to the Run Pay Server
 */

const bsv = require('bsv')
const request = require('./request')
const { _text } = require('../kernel/misc')
const PurseWrapper = require('./purse-wrapper')
const RunConnect = require('./run-connect')

// ------------------------------------------------------------------------------------------------

/**
 * A Purse implementation that pays for transactions using Run's remote server
 *
 * To generate an API key: https://api.run.network/v1/test/pay/generate
 */
class PayServer extends PurseWrapper {
  constructor (apiKey) {
    super()

    let hdkey = null
    try {
      hdkey = new bsv.HDPublicKey(apiKey)
    } catch (e) {
      throw new Error(`Invalid API key: ${_text(apiKey)}`)
    }

    this.network = hdkey.network.name === 'mainnet' || hdkey.network.name === 'livenet' ? 'main' : 'test'
    this.apiKey = apiKey
    this.timeout = 5000
    this.request = request
    this.host = 'https://api.run.network'
  }

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  async pay (rawtx, parents) {
    const url = `${this.host}/v1/${this.network}/pay`
    const body = { rawtx, parents, key: this.apiKey }
    const options = { method: 'POST', body, timeout: this.timeout }
    const response = await this.request(url, options)
    return response.rawtx
  }

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    // If our blockchain instance of RunConnect, use it to notify about the tx
    if (this.blockchain instanceof RunConnect && this.network === this.blockchain.network) {
      await this.blockchain.broadcast(rawtx)
      return
    }

    // For all other APIs, broadcast to our server anyway, so we know about it soon
    const url = `${this.host}/v1/${this.network}/tx`
    const body = { rawtx }
    const options = { method: 'POST', body, timeout: this.timeout }
    await this.request(url, options)
  }

  // --------------------------------------------------------------------------
  // cancel
  // --------------------------------------------------------------------------

  async cancel (rawtx) {
    // In the future, we should notify server about the cancelled payment
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = PayServer
