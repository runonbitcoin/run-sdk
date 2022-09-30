/**
 * recent-broadcasts.js
 *
 * Tests for lib/plugins/recent-broadcasts.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const RecentBroadcasts = unmangle(unmangle(Run)._RecentBroadcasts)

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const CONFIG_KEY_RECENT_BROADCASTS = 'config://recent-broadcasts'

// ------------------------------------------------------------------------------------------------
// RecentBroadcasts
// ------------------------------------------------------------------------------------------------

describe('RecentBroadcasts', () => {
  // ----------------------------------------------------------------------------------------------
  // _addToCache
  // ----------------------------------------------------------------------------------------------

  describe('_addToCache', () => {
    it('adds new transaction', async () => {
      const cache = new Map()
      const tx = new bsv.Transaction()
      const address = new bsv.PrivateKey().toAddress()
      const script = bsv.Script.fromAddress(address).toHex()
      const satoshis = 100
      tx.to(address, satoshis)
      const prevTxId = '1111111111111111111111111111111111111111111111111111111111111111'
      tx.from({ txid: prevTxId, vout: 123, script: 'abc', satoshis: 456 })
      const date = Date.now()
      await RecentBroadcasts._addToCache(cache, tx, tx.hash)
      const recentBroadcasts = cache.get(CONFIG_KEY_RECENT_BROADCASTS)
      expect(recentBroadcasts.length).to.equal(1)
      expect(recentBroadcasts[0].txid).to.equal(tx.hash)
      expect(recentBroadcasts[0].rawtx).to.equal(tx.toString())
      expect(recentBroadcasts[0].time >= date).to.equal(true)
      expect(recentBroadcasts[0].inputs).to.deep.equal([{ txid: prevTxId, vout: 123 }])
      expect(recentBroadcasts[0].outputs).to.deep.equal([{ txid: tx.hash, vout: 0, script, satoshis }])
    })

    // ------------------------------------------------------------------------

    it('filters expired', async () => {
      const cache = new Map()
      const tx1 = new bsv.Transaction()
      tx1.to(new bsv.PrivateKey().toAddress(), 100)
      await RecentBroadcasts._addToCache(cache, tx1, tx1.hash)
      await new Promise((resolve, reject) => setTimeout(resolve, 100))
      const tx2 = new bsv.Transaction()
      tx2.to(new bsv.PrivateKey().toAddress(), 100)
      await RecentBroadcasts._addToCache(cache, tx2, tx2.hash, 10)
      const recentBroadcasts = cache.get(CONFIG_KEY_RECENT_BROADCASTS)
      expect(recentBroadcasts.length).to.equal(1)
      expect(recentBroadcasts[0].outputs[0].txid).to.equal(tx2.hash)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _correctUtxosUsingCache
  // ----------------------------------------------------------------------------------------------

  describe('_correctUtxosUsingCache', () => {
    it('removes spent utxos', async () => {
      const cache = new Map()
      const address1 = new bsv.PrivateKey().toAddress()
      const address2 = new bsv.PrivateKey().toAddress()
      const tx1 = new bsv.Transaction()
      tx1.to(address1, 100)
      const utxos = [{ txid: tx1.hash, vout: 0, script: tx1.outputs[0].script.toHex(), satoshis: tx1.outputs[0].satoshis }]
      const tx2 = new bsv.Transaction()
      tx2.from(utxos[0])
      tx2.to(address2, 200)
      await RecentBroadcasts._addToCache(cache, tx2, tx2.hash)
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, bsv.Script.fromAddress(address1).toHex())
      expect(utxos.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('adds unspent utxos', async () => {
      const cache = new Map()
      const utxos = []
      const address = new bsv.PrivateKey().toAddress()
      const tx = new bsv.Transaction()
      tx.to(address, 100)
      await RecentBroadcasts._addToCache(cache, tx, tx.hash)
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, bsv.Script.fromAddress(address).toHex())
      expect(utxos.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('does not add already added utxos', async () => {
      const cache = new Map()
      const address = new bsv.PrivateKey().toAddress()
      const tx = new bsv.Transaction()
      tx.to(address, 100)
      const utxos = [{ txid: tx.hash, vout: 0, script: bsv.Script.fromAddress(address).toHex(), satoshis: 100 }]
      await RecentBroadcasts._addToCache(cache, tx, tx.hash)
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, bsv.Script.fromAddress(address).toHex())
      expect(utxos.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('does not add spent utxos', async () => {
      const cache = new Map()
      const address = new bsv.PrivateKey().toAddress()
      const tx1 = new bsv.Transaction()
      tx1.to(address, 100)
      const utxos = [{ txid: tx1.hash, vout: 0, script: tx1.outputs[0].script.toHex(), satoshis: tx1.outputs[0].satoshis }]
      const tx2 = new bsv.Transaction()
      tx2.from(utxos[0])
      tx2.to(address, 200)
      await RecentBroadcasts._addToCache(cache, tx2, tx2.hash)
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, bsv.Script.fromAddress(address).toHex())
      expect(utxos.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('filters expired', async () => {
      const cache = new Map()
      const utxos = []
      const address = new bsv.PrivateKey().toAddress()
      const tx = new bsv.Transaction()
      tx.to(address, 100)
      await RecentBroadcasts._addToCache(cache, tx, tx.hash)
      await new Promise((resolve, reject) => setTimeout(resolve, 100))
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, bsv.Script.fromAddress(address).toHex(), 10)
      expect(utxos.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('empty cache does nothing', async () => {
      const cache = new Map()
      const utxos = [{ txid: new bsv.Transaction().hash, vout: 1, script: 'abc', satoshis: 123 }]
      await RecentBroadcasts._correctUtxosUsingCache(cache, utxos, '123')
      expect(utxos.length).to.equal(1)
    })
  })
})

// ------------------------------------------------------------------------------------------------
