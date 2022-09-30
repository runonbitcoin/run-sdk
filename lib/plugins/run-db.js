/**
 * run-db.js
 *
 * Cache that connects to a Run-DB instnace
 */

const { _scripthash } = require('../kernel/bsv')
const request = require('./request')
const StateWrapper = require('./state-wrapper')

// ------------------------------------------------------------------------------------------------
// RunDB
// ------------------------------------------------------------------------------------------------

class RunDB extends StateWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (host) {
    super()

    this.host = host
    this.request = request
  }

  // --------------------------------------------------------------------------
  // pull
  // --------------------------------------------------------------------------

  async pull (key, options) {
    const [protocol, path] = key.split('://')

    let url = null

    switch (protocol) {
      case 'jig': { url = `${this.host}/jig/${path}`; break }
      case 'berry': { url = `${this.host}/berry/${encodeURIComponent(path)}`; break }
      case 'trust': { url = `${this.host}/trust/${path}`; break }
      // Bans are not pulled from Run-DB, because if Run-DB bans, then the jig state is also gone
      case 'ban': return
      case 'tx': { url = `${this.host}/tx/${path}`; break }
      case 'spend': { url = `${this.host}/spends/${path}`; break }
      case 'time': { url = `${this.host}/time/${path}`; break }
      // Anything else is not supported
      default: return
    }

    let value
    try {
      value = await this.request(url)
    } catch (e) {
      if (e.status === 404) return undefined
      throw e
    }

    // If we are getting a jig, get its tx too
    if (options && options.tx && protocol === 'jig' && this.cache) {
      try {
        const txid = path.slice(0, 64)
        const txurl = `${this.host}/tx/${txid}`
        const rawtx = await this.request(txurl)
        await this.cache.set(`tx://${txid}`, rawtx)
      } catch (e) { if (e.status !== 404) throw e }
    }

    // Note: The all and filter options are not supported with RundB yet

    return value
  }

  // --------------------------------------------------------------------------
  // locations
  // --------------------------------------------------------------------------

  async locations (script) {
    const scripthash = await _scripthash(script)
    const url = `${this.host}/unspent?scripthash=${scripthash}`
    return await this.request(url)
  }

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    await this.request(`${this.host}/tx`, {
      method: 'POST',
      body: rawtx,
      headers: { 'content-type': 'text/plain' }
    })
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = RunDB
