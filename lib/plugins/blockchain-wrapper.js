/**
 * blockchain-wrapper.js
 *
 * Wraps a Run Blockchain implementation to add common functionality:
 *
 *    - Logging calls
 *    - Logging performance
 *    - Caching API responses
 *    - Validating parameters and responses
 *    - Correcting returned UTXOs with known recently-broadcasted transactions
 *    - Allowing an address to be passed to utxos()
 *    - Allowing a bsv.Transaction to be passed to broadcast()
 *
 * Other notes
 *
 *    - The cache property will be set to a Cache implementation by Run
 *
 * To use, either wrap a blockchain instance:
 *
 *    new BlockchainWrapper(myBlockchain)
 *
 * or extend your class from it:
 *
 *    class MyBlockchain extends BlockchainWrapper { ... }
 */

const bsv = require('bsv')
const RecentBroadcasts = require('./recent-broadcasts')
const Log = require('../kernel/log')
const LocalCache = require('./local-cache')
const { _text, _defineGetter } = require('../kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const HEX_REGEX = /^(?:[a-fA-F0-9][a-fA-F0-9])*$/

// ------------------------------------------------------------------------------------------------
// BlockchainWrapper
// ------------------------------------------------------------------------------------------------

class BlockchainWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (blockchain = this, cache = new LocalCache()) {
    this.tag = blockchain.constructor.name === 'Object' ? 'Blockchain' : blockchain.constructor.name

    this.cache = cache

    this.unwrappedBlockchain = blockchain
    this.unwrappedBroadcast = blockchain.broadcast
    this.unwrappedFetch = blockchain.fetch
    this.unwrappedUtxos = blockchain.utxos
    this.unwrappedSpends = blockchain.spends
    this.unwrappedTime = blockchain.time

    if (this !== this.unwrappedBlockchain) {
      _defineGetter(this, 'network', () => this.unwrappedBlockchain.network)
    }

    this.setWrappingEnabled(true)
  }

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  setWrappingEnabled (enabled) {
    if (enabled) {
      this.broadcast = BlockchainWrapper.prototype.wrappedBroadcast
      this.fetch = BlockchainWrapper.prototype.wrappedFetch
      this.utxos = BlockchainWrapper.prototype.wrappedUtxos
      this.spends = BlockchainWrapper.prototype.wrappedSpends
      this.time = BlockchainWrapper.prototype.wrappedTime
    } else {
      this.broadcast = this.unwrappedBroadcast
      this.fetch = this.unwrappedFetch
      this.utxos = this.unwrappedUtxos
      this.spends = this.unwrappedSpends
      this.time = this.unwrappedTime
    }
  }

  // --------------------------------------------------------------------------
  // wrappedBroadcast
  // --------------------------------------------------------------------------

  async wrappedBroadcast (rawtx) {
    // Allow both raw transactions and bsv transactions
    let tx = null
    try {
      tx = new bsv.Transaction(rawtx)
    } catch (e) {
      throw new Error(`Invalid transaction: ${_text(e.toString())}`)
    }
    rawtx = typeof rawtx === 'string' ? rawtx : tx.toString()

    // Basic transaction checks
    if (tx.inputs.length === 0) throw new Error('tx has no inputs')
    if (tx.outputs.length === 0) throw new Error('tx has no outputs')
    try {
      if (tx.verify() !== true) throw new Error(tx.verify())
    } catch (e) {
      if (e.message.includes('duplicate input')) {
        throw new Error('bad-txns-inputs-duplicate')
      } else {
        throw e
      }
    }

    // Check if we recently broadcasted this transaction already
    if (this.cache) {
      const recentBroadcasts = await this.cache.get('config://recent-broadcasts')
      const existing = recentBroadcasts && recentBroadcasts.find(x => x.rawtx === rawtx)
      if (existing) {
        if (Log._infoOn) Log._info(this.tag, 'Already broadcasted', existing.txid)
        return existing.txid
      }
    }

    // Broadcast the transaction
    if (Log._infoOn) Log._info(this.tag, 'Broadcast', tx.hash)
    const start = new Date()
    const txid = await this.unwrappedBroadcast.call(this.unwrappedBlockchain, rawtx)
    if (Log._debugOn) Log._debug(this.tag, 'Broadcast (end): ' + (new Date() - start) + 'ms')

    // Validate the txid
    const badTxid = typeof txid !== 'string' || txid.length !== 64 || !HEX_REGEX.test(txid)
    if (badTxid) throw new Error(`Invalid response txid: ${txid}`)
    if (Log._debugOn && tx.hash !== txid) throw new Error(`Txid response mismatch: ${txid}`)

    // Cache the transaction
    if (this.cache) {
      const cacheSets = []

      // Store the transaction time. Allow errors if there are dups.
      const previousTime = await this.cache.get(`time://${txid}`)
      if (typeof previousTime === 'undefined') {
        const promise = this.cache.set(`time://${txid}`, Date.now())
        if (promise instanceof Promise) promise.catch(e => {})
        cacheSets.push(promise)
      }

      // Mark inputs as spent
      for (const input of tx.inputs) {
        const prevtxid = input.prevTxId.toString('hex')
        const location = `${prevtxid}_o${input.outputIndex}`
        cacheSets.push(this.cache.set(`spend://${location}`, txid))
      }

      // Cache the transaction itself
      cacheSets.push(this.cache.set(`tx://${txid}`, rawtx))

      // Update our recent broadcasts
      cacheSets.push(RecentBroadcasts._addToCache(this.cache, tx, txid))

      // Wait for all cache updates to finish
      await Promise.all(cacheSets)
    }

    return txid
  }

  // ------------------------------------------------------------------------
  // wrappedFetch
  // ------------------------------------------------------------------------

  async wrappedFetch (txid) {
    // Validate the txid
    const badTxid = typeof txid !== 'string' || txid.length !== 64 || !HEX_REGEX.test(txid)
    if (badTxid) throw new Error(`Invalid txid: ${_text(txid)}`)

    // Check the cache. In client mode, we must use the cache.
    const cachedTx = this.cache ? await this.cache.get(`tx://${txid}`) : undefined
    if (typeof cachedTx !== 'undefined') return cachedTx

    // Fetch
    if (Log._infoOn) Log._info(this.tag, 'Fetch', txid)
    const start = new Date()
    const rawtx = await this.unwrappedFetch.call(this.unwrappedBlockchain, txid)
    if (Log._debugOn) Log._debug(this.tag, 'Fetch (end): ' + (new Date() - start) + 'ms')

    // Check the response is correct
    if (typeof rawtx !== 'string' || !rawtx.length || !HEX_REGEX.test(rawtx)) {
      throw new Error(`Invalid rawtx fetched for ${txid}: ${rawtx}`)
    }
    if (Log._debugOn && new bsv.Transaction(rawtx).hash !== txid) {
      throw new Error(`Transaction fetch mismatch for ${txid}`)
    }

    // Cache the transaction and its spends
    if (this.cache) {
      const cacheSets = []

      cacheSets.push(this.cache.set(`tx://${txid}`, rawtx))

      const bsvtx = new bsv.Transaction(rawtx)
      bsvtx.inputs.forEach(input => {
        const prevtxid = input.prevTxId.toString('hex')
        const location = `${prevtxid}_o${input.outputIndex}`
        cacheSets.push(this.cache.set(`spend://${location}`, txid))
      })

      await Promise.all(cacheSets)
    }

    return rawtx
  }

  // ------------------------------------------------------------------------
  // wrappedUtxos
  // ------------------------------------------------------------------------

  async wrappedUtxos (script) {
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
    if (Log._infoOn) Log._info(this.tag, 'Utxos', script)
    const start = new Date()
    let utxos = await this.unwrappedUtxos.call(this.unwrappedBlockchain, script)
    if (Log._debugOn) Log._debug(this.tag, 'Utxos (end): ' + (new Date() - start) + 'ms')

    // Check the response
    if (!Array.isArray(utxos) || utxos.some(utxo => {
      if (typeof utxo.txid !== 'string') return true
      if (utxo.txid.length !== 64) return true
      if (!HEX_REGEX.test(utxo.txid)) return true
      if (typeof utxo.vout !== 'number') return true
      if (!Number.isInteger(utxo.vout)) return true
      if (utxo.vout < 0) return true
      if (typeof utxo.script !== 'string') return true
      if (!HEX_REGEX.test(utxo.script)) return true
      if (typeof utxo.satoshis !== 'number') return true
      if (!Number.isInteger(utxo.satoshis)) return true
      if (utxo.satoshis < 0) return true
    })) {
      throw new Error(`Received invalid utxos: ${_text(utxos)}`)
    }

    // In case the server has a bug, Run must be able to handle duplicate utxos returned. If we
    // don't dedup, then later we may create a transaction with more than one of the same input,
    // for example in Token combines.
    const locations = new Set()
    utxos = utxos.filter(utxo => {
      const location = `${utxo.txid}_o${utxo.vout}`
      if (!locations.has(location)) {
        locations.add(location)
        return true
      } else {
        if (Log._warnOn) Log._warn(this.tag, 'Duplicate utxo returned from server:', location)
        return false
      }
    })

    // Correct utxos with known recent broadcasts
    if (this.cache) {
      await RecentBroadcasts._correctUtxosUsingCache(this.cache, utxos, script)
    }

    return utxos
  }

  // ------------------------------------------------------------------------
  // wrappedSpends
  // ------------------------------------------------------------------------

  async wrappedSpends (txid, vout) {
    // Validate the txid
    const badTxid = typeof txid !== 'string' || txid.length !== 64 || !HEX_REGEX.test(txid)
    if (badTxid) {
      // Check if it is a location string
      try {
        const location = txid
        const parts = location.split('_o')
        txid = parts[0]
        vout = parseInt(parts[1])
        const badTxid = typeof txid !== 'string' || txid.length !== 64 || !HEX_REGEX.test(txid)
        if (badTxid) throw new Error()
      } catch (e) {
        throw new Error(`Invalid txid: ${_text(txid)}`)
      }
    }

    // Validate the vout
    const badVout = typeof vout !== 'number' || !Number.isInteger(vout) || vout < 0
    if (badVout) throw new Error(`Invalid vout: ${_text(vout)}`)

    // Check the cache. In client mode, we must use the cache.
    const cachedSpend = this.cache ? await this.cache.get(`spend://${txid}_o${vout}`) : undefined
    if (typeof cachedSpend !== 'undefined') return cachedSpend

    // Call the API
    if (Log._infoOn) Log._info(this.tag, `Spends ${txid}_o${vout}`)
    const start = new Date()
    const spend = await this.unwrappedSpends.call(this.unwrappedBlockchain, txid, vout)
    if (Log._debugOn) Log._debug(this.tag, 'Spends (end): ' + (new Date() - start) + 'ms')

    // Check the response
    if (spend !== null && !(typeof spend === 'string' && spend.length === 64 && HEX_REGEX.test(spend))) {
      throw new Error(`Invalid spend txid fetched for ${txid}_o${vout}: ${spend}`)
    }

    // Cache the spend
    if (spend && this.cache) {
      await this.cache.set(`spend://${txid}_o${vout}`, spend)
    }

    return spend
  }

  // --------------------------------------------------------------------------
  // wrappedTime
  // --------------------------------------------------------------------------

  async wrappedTime (txid) {
    // Validate the txid
    const badTxid = typeof txid !== 'string' || txid.length !== 64 || !HEX_REGEX.test(txid)
    if (badTxid) throw new Error(`Invalid txid: ${_text(txid)}`)

    // Check the cache. In client mode, we must use the cache.
    const cachedTime = this.cache ? await this.cache.get(`time://${txid}`) : undefined
    if (typeof cachedTime !== 'undefined') return cachedTime

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Time', txid)
    const start = new Date()
    const time = await this.unwrappedTime.call(this.unwrappedBlockchain, txid)
    if (Log._debugOn) Log._debug(this.tag, 'Time (end): ' + (new Date() - start) + 'ms')

    // Check the response
    if (typeof time !== 'number' || time < 0) throw new Error(`Invalid time fetched for ${txid}: ${time}`)

    // Cache the time
    if (this.cache) {
      await this.cache.set(`time://${txid}`, time)
    }

    return time
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = BlockchainWrapper
