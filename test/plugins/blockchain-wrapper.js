/**
 * blockchain-wrapper.js
 *
 * Tests for lib/plugins/blockchain-wrapper.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const { stub } = require('sinon')
const bsv = require('bsv')
const Run = require('../env/run')
const { BlockchainWrapper } = Run.plugins
const unmangle = require('../env/unmangle')
const Log = unmangle(unmangle(Run)._Log)
const RecentBroadcasts = unmangle(unmangle(Run)._RecentBroadcasts)

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function stubBlockchain () {
  return stub({
    network: 'abc',
    broadcast: () => {},
    fetch: () => {},
    utxos: () => {},
    spends: () => {},
    time: () => {}
  })
}

function mockTransaction () {
  return new bsv.Transaction()
    .from({ txid: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, script: '', satoshis: 0 })
    .to(new bsv.PrivateKey().toAddress(), 0)
}

// ------------------------------------------------------------------------------------------------
// BlockchainWrapper
// ------------------------------------------------------------------------------------------------

describe('BlockchainWrapper', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('wraps methods when extended', () => {
      class MyBlockchain extends BlockchainWrapper {
        get network () { 'abc' }
        broadcast () { }
        fetch () { }
        utxos () { }
        spends () { }
        time () { }
      }
      const wrapper = new MyBlockchain()
      expect(wrapper.broadcast).not.to.equal(MyBlockchain.prototype.broadcast)
      expect(wrapper.fetch).not.to.equal(MyBlockchain.prototype.fetch)
      expect(wrapper.utxos).not.to.equal(MyBlockchain.prototype.utxos)
      expect(wrapper.spends).not.to.equal(MyBlockchain.prototype.spends)
      expect(wrapper.time).not.to.equal(MyBlockchain.prototype.time)
      expect(wrapper.network).to.equal(MyBlockchain.prototype.network)
    })

    // ------------------------------------------------------------------------

    it('wraps methods when passed in', () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      expect(wrapper.broadcast).not.to.equal(blockchain.broadcast)
      expect(wrapper.fetch).not.to.equal(blockchain.fetch)
      expect(wrapper.utxos).not.to.equal(blockchain.utxos)
      expect(wrapper.spends).not.to.equal(blockchain.spends)
      expect(wrapper.time).not.to.equal(blockchain.time)
      expect(wrapper.network).to.equal(blockchain.network)
    })

    // ------------------------------------------------------------------------

    it('supports no cache', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain, null)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      blockchain.fetch.returns(rawtx)
      blockchain.utxos.returns([])
      blockchain.spends.returns(null)
      blockchain.time.returns(Date.now())
      await wrapper.broadcast(rawtx)
      await wrapper.fetch(txid)
      await wrapper.utxos(tx.outputs[0].script.toHex())
      await wrapper.time(txid)
      await wrapper.spends(txid, 0)
    })

    // ------------------------------------------------------------------------

    it('supports map cache', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain, new Map())
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      blockchain.fetch.returns(rawtx)
      blockchain.utxos.returns([])
      blockchain.spends.returns(null)
      blockchain.time.returns(Date.now())
      await wrapper.broadcast(rawtx)
      await wrapper.fetch(txid)
      await wrapper.utxos(tx.outputs[0].script.toHex())
      await wrapper.time(txid)
      await wrapper.spends(txid, 0)
    })

    // ------------------------------------------------------------------------

    it('supports no logger', async () => {
      Log._logger = null
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain, null)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      blockchain.fetch.returns(rawtx)
      blockchain.utxos.returns([])
      blockchain.spends.returns(null)
      blockchain.time.returns(Date.now())
      await wrapper.broadcast(rawtx)
      await wrapper.fetch(txid)
      await wrapper.utxos(tx.outputs[0].script.toHex())
      await wrapper.time(txid)
      await wrapper.spends(txid, 0)
    })
  })

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('wraps call', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      const response = await wrapper.broadcast(rawtx)
      expect(response).to.equal(txid)
      expect(blockchain.broadcast.args[0][0]).to.equal(rawtx)
    })

    // ------------------------------------------------------------------------

    it('logs call with txid', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      blockchain.broadcast.returns(tx.hash)
      await wrapper.broadcast(tx.toString())
      expect(logger.info.args.some(args => args.join(' ').includes(`[Blockchain] Broadcast ${tx.hash}`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs with class name', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const tx = mockTransaction()
      class MyBlockchain extends BlockchainWrapper {
        get network () { 'abc' }
        broadcast () { return tx.hash }
        fetch () { }
        utxos () { }
        spends () { }
        time () { }
      }
      const wrapper = new MyBlockchain()
      await wrapper.broadcast(tx.toString())
      expect(logger.info.args.some(args => args.join(' ').includes(`[MyBlockchain] Broadcast ${tx.hash}`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      blockchain.broadcast.returns(tx.hash)
      await wrapper.broadcast(tx.toString())
      expect(logger.debug.args.some(args => args.join(' ').includes('[Blockchain] Broadcast (end): '))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates txid', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      blockchain.broadcast.returns(null)
      await expect(wrapper.broadcast(rawtx)).to.be.rejectedWith('Invalid response txid: null')
    })

    // ------------------------------------------------------------------------

    it('validates txid response matches in debug mode', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      blockchain.broadcast.returns('0000000000000000000000000000000000000000000000000000000000000000')
      await expect(wrapper.broadcast(rawtx)).to.be.rejectedWith('Txid response mismatch')
    })

    // ------------------------------------------------------------------------

    it('validates tx is valid', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      await expect(wrapper.broadcast('abc')).to.be.rejectedWith('Invalid transaction')
    })

    // ------------------------------------------------------------------------

    it('accepts bsv transaction', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      blockchain.broadcast.returns(tx.hash)
      await wrapper.broadcast(tx)
    })

    // ------------------------------------------------------------------------

    it('throws if no inputs', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = new bsv.Transaction().to(new bsv.PrivateKey().toAddress(), 0)
      await expect(wrapper.broadcast(tx.toString())).to.be.rejectedWith('tx has no inputs')
    })

    // ------------------------------------------------------------------------

    it('throws if no outputs', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = new bsv.Transaction()
        .from({ txid: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, script: '', satoshis: 0 })
      await expect(wrapper.broadcast(tx.toString())).to.be.rejectedWith('tx has no outputs')
    })

    // ------------------------------------------------------------------------

    it('throws if too big satoshis', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = new bsv.Transaction()
        .from({ txid: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, script: '', satoshis: 0 })
        .to(new bsv.PrivateKey().toAddress(), Number.MAX_SAFE_INTEGER)
      await expect(wrapper.broadcast(tx.toString())).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('throws if duplicate inputs', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = new bsv.Transaction()
        .from({ txid: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, script: '', satoshis: 0 })
        .from({ txid: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, script: '', satoshis: 0 })
        .to(new bsv.PrivateKey().toAddress(), 0)
      await expect(wrapper.broadcast(tx.toString())).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('caches time if exists', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      await wrapper.broadcast(rawtx)
      const key = `time://${txid}`
      const value = await wrapper.cache.get(key)
      expect(typeof value).to.equal('number')
      expect(value > Date.now() - 1000).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('does not cache time if already exists', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      const key = `time://${txid}`
      await wrapper.cache.set(key, 1234)
      await wrapper.broadcast(rawtx)
      const value = await wrapper.cache.get(key)
      expect(value).to.equal(1234)
    })

    // ------------------------------------------------------------------------

    it('caches spent inputs', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      await wrapper.broadcast(rawtx)
      const key = `spend://${tx.inputs[0].prevTxId.toString('hex')}_o${tx.inputs[0].outputIndex}`
      const value = await wrapper.cache.get(key)
      expect(value).to.equal(txid)
    })

    // ------------------------------------------------------------------------

    it('caches tx', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      await wrapper.broadcast(rawtx)
      const key = `tx://${txid}`
      const value = await wrapper.cache.get(key)
      expect(value).to.equal(rawtx)
    })

    // ------------------------------------------------------------------------

    it('updates recent broadcasts', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      await wrapper.broadcast(rawtx)
      const key = 'config://recent-broadcasts'
      const value = await wrapper.cache.get(key)
      expect(Array.isArray(value)).to.equal(true)
      expect(value.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('does not broadcast if recently broadcast', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.broadcast.returns(txid)
      await wrapper.broadcast(rawtx)
      await wrapper.broadcast(rawtx)
      Log._logger = null
      const resp = await wrapper.broadcast(rawtx)
      expect(resp).to.equal(txid)
      expect(blockchain.broadcast.callCount).to.equal(1)
    })
  })

  // --------------------------------------------------------------------------
  // fetch
  // --------------------------------------------------------------------------

  describe('fetch', () => {
    it('wraps call', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.fetch.returns(rawtx)
      const response = await wrapper.fetch(txid)
      expect(response).to.equal(rawtx)
      expect(blockchain.fetch.args[0][0]).to.equal(txid)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.fetch.returns(rawtx)
      await wrapper.fetch(txid)
      expect(logger.info.args.some(args => args.join(' ').includes(`[Blockchain] Fetch ${txid}`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.fetch.returns(rawtx)
      await wrapper.fetch(txid)
      expect(logger.debug.args.some(args => args.join(' ').includes('[Blockchain] Fetch (end): '))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates txid', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      await expect(wrapper.fetch('abcxyz')).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.fetch(null)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.fetch(undefined)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.fetch('00000000000000000000000000000000000000000000000000000000000000001')).to.be.rejectedWith('Invalid txid')
    })

    // ------------------------------------------------------------------------

    it('validates response', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = new bsv.Transaction().hash
      blockchain.fetch.returns('abc')
      await expect(wrapper.fetch(txid)).to.be.rejectedWith('Invalid rawtx')
    })

    // ------------------------------------------------------------------------

    it('validates rawtx matches in debug mode', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = new bsv.Transaction().hash
      blockchain.fetch.returns(mockTransaction().toString())
      await expect(wrapper.fetch(txid)).to.be.rejectedWith('Transaction fetch mismatch')
    })

    // ------------------------------------------------------------------------

    it('gets from cache if exists', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      await wrapper.cache.set(`tx://${txid}`, rawtx)
      expect(await wrapper.fetch(txid)).to.equal(rawtx)
      expect(blockchain.fetch.callCount).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('caches tx', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.fetch.returns(rawtx)
      await wrapper.fetch(txid)
      const value = await wrapper.cache.get(`tx://${txid}`)
      expect(value).to.equal(rawtx)
    })

    // ------------------------------------------------------------------------

    it('caches spends', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const tx = mockTransaction()
      const rawtx = tx.toString()
      const txid = tx.hash
      blockchain.fetch.returns(rawtx)
      await wrapper.fetch(txid)
      const key = `spend://${tx.inputs[0].prevTxId.toString('hex')}_o${tx.inputs[0].outputIndex}`
      const value = await wrapper.cache.get(key)
      expect(value).to.equal(txid)
    })
  })

  // --------------------------------------------------------------------------
  // utxos
  // --------------------------------------------------------------------------

  describe('utxos', () => {
    it('wraps call', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const utxos = [{ txid, vout: 0, script, satoshis: 0 }]
      blockchain.utxos.returns(utxos)
      const response = await wrapper.utxos(script)
      expect(response).to.deep.equal(utxos)
      expect(blockchain.utxos.args[0][0]).to.equal(script)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      blockchain.utxos.returns([])
      await wrapper.utxos(script)
      expect(logger.info.args.some(args => args.join(' ').includes(`[Blockchain] Utxos ${script}`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      blockchain.utxos.returns([])
      await wrapper.utxos(script)
      expect(logger.debug.args.some(args => args.join(' ').includes('[Blockchain] Utxos (end): '))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates script', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      await expect(wrapper.utxos()).to.be.rejectedWith('Invalid script')
      await expect(wrapper.utxos(null)).to.be.rejectedWith('Invalid script')
      await expect(wrapper.utxos({})).to.be.rejectedWith('Invalid script')
      await expect(wrapper.utxos('a b c d e f')).to.be.rejectedWith('Invalid script')
    })

    // ------------------------------------------------------------------------

    it('accepts bsv script', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const utxos = [{ txid, vout: 0, script, satoshis: 0 }]
      blockchain.utxos.returns(utxos)
      const response = await wrapper.utxos(new bsv.Script(script))
      expect(response).to.deep.equal(utxos)
      expect(blockchain.utxos.args[0][0]).to.equal(script)
    })

    // ------------------------------------------------------------------------

    it('accepts address', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const utxos = [{ txid, vout: 0, script, satoshis: 0 }]
      blockchain.utxos.returns(utxos)
      const response = await wrapper.utxos(address)
      expect(response).to.deep.equal(utxos)
      expect(blockchain.utxos.args[0][0]).to.equal(script)
    })

    // ------------------------------------------------------------------------

    it('accepts bsv address', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const utxos = [{ txid, vout: 0, script, satoshis: 0 }]
      blockchain.utxos.returns(utxos)
      const response = await wrapper.utxos(new bsv.Address(address))
      expect(response).to.deep.equal(utxos)
      expect(blockchain.utxos.args[0][0]).to.equal(script)
    })

    // ------------------------------------------------------------------------

    it('validates response', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      // Not an array
      blockchain.utxos.returns(null)
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns({})
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      // Bad txid
      blockchain.utxos.returns([{ txid: null, vout: 0, script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid: 'abc', vout: 0, script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', vout: 0, script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      // Bad vout
      blockchain.utxos.returns([{ txid, vout: '0', script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid, vout: 0.5, script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid, vout: -1, script, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      // Bad script
      blockchain.utxos.returns([{ txid, vout: 0, script: null, satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid, vout: 0, script: 'ZZ', satoshis: 0 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      // Bad satoshis
      blockchain.utxos.returns([{ txid, vout: 0, script, satoshis: true }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid, vout: 0, script, satoshis: 1000.1 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
      blockchain.utxos.returns([{ txid, vout: 0, script, satoshis: -1 }])
      await expect(wrapper.utxos(script)).to.be.rejectedWith('Received invalid utxos')
    })

    // ------------------------------------------------------------------------

    it('dedups utxos', async () => {
      Log._logger = null
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const a = { txid, vout: 1, script: '', satoshis: 3 }
      const b = { txid, vout: 5, script: '', satoshis: 7 }
      blockchain.utxos.returns([a, b, b, a])
      const response = await wrapper.utxos(script)
      expect(response).to.deep.equal([a, b])
    })

    // ------------------------------------------------------------------------

    it('logs warning if duplicate utxos', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const a = { txid, vout: 1, script: '', satoshis: 3 }
      blockchain.utxos.returns([a, a])
      await wrapper.utxos(script)
      expect(logger.warn.args.some(args => args.join(' ').includes('[Blockchain] Duplicate utxo returned from server'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('corrects utxos with recent broadcasts', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const address = new bsv.PrivateKey().toAddress().toString()
      const script = bsv.Script.fromAddress(address).toHex()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const utxo = { txid, vout: 1, script, satoshis: 3 }
      blockchain.utxos.returns([utxo])
      const spendTx = new bsv.Transaction().from(utxo).to(address, 4)
      const spendTxid = spendTx.hash
      const spendUtxo = { txid: spendTxid, vout: 0, script, satoshis: 4 }
      await RecentBroadcasts._addToCache(wrapper.cache, spendTx, spendTxid)
      const value = await wrapper.utxos(script)
      expect(value).to.deep.equal([spendUtxo])
    })
  })

  // --------------------------------------------------------------------------
  // spends
  // --------------------------------------------------------------------------

  describe('spends', () => {
    it('wraps call', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.spends.returns(b)
      const response = await wrapper.spends(a, 0)
      expect(response).to.deep.equal(b)
      expect(blockchain.spends.args[0][0]).to.equal(a)
      expect(blockchain.spends.args[0][1]).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.spends.returns(b)
      await wrapper.spends(a, 0)
      expect(logger.info.args.some(args => args.join(' ').includes(`[Blockchain] Spends ${a}_o0`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.spends.returns(b)
      await wrapper.spends(a, 0)
      expect(logger.debug.args.some(args => args.join(' ').includes('[Blockchain] Spends (end)'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates txid', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      await expect(wrapper.spends(undefined, 0)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.spends(null, 0)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.spends(() => {}, 0)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.spends('xyz', 0)).to.be.rejectedWith('Invalid txid')
    })

    // ------------------------------------------------------------------------

    it('validates vout', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      await expect(wrapper.spends(txid)).to.be.rejectedWith('Invalid vout')
      await expect(wrapper.spends(txid, null)).to.be.rejectedWith('Invalid vout')
      await expect(wrapper.spends(txid, 0.5)).to.be.rejectedWith('Invalid vout')
      await expect(wrapper.spends(txid, -1)).to.be.rejectedWith('Invalid vout')
    })

    // ------------------------------------------------------------------------

    it('accepts location', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.spends.returns(b)
      const response = await wrapper.spends(`${a}_o${0}`)
      expect(response).to.deep.equal(b)
      expect(blockchain.spends.args[0][0]).to.equal(a)
      expect(blockchain.spends.args[0][1]).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('validates response', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      blockchain.spends.returns(undefined)
      await expect(wrapper.spends(a, 0)).to.be.rejectedWith('Invalid spend txid')
      blockchain.spends.returns('abc')
      await expect(wrapper.spends(a, 0)).to.be.rejectedWith('Invalid spend txid')
    })

    // ------------------------------------------------------------------------

    it('gets from cache if exists', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      await wrapper.cache.set(`spend://${a}_o0`, b)
      const value = await wrapper.spends(a, 0)
      expect(value).to.equal(b)
    })

    // ------------------------------------------------------------------------

    it('caches spend', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const a = '0000000000000000000000000000000000000000000000000000000000000000'
      const b = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.spends.returns(b)
      await wrapper.spends(a, 0)
      const value = await wrapper.cache.get(`spend://${a}_o0`)
      expect(value).to.equal(b)
    })
  })

  // --------------------------------------------------------------------------
  // time
  // --------------------------------------------------------------------------

  describe('time', () => {
    it('wraps call', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      const time = Date.now()
      blockchain.time.returns(time)
      const response = await wrapper.time(txid)
      expect(response).to.deep.equal(time)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.time.returns(Date.now())
      await wrapper.time(txid)
      expect(logger.info.args.some(args => args.join(' ').includes(`[Blockchain] Time ${txid}`))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.time.returns(Date.now())
      await wrapper.time(txid)
      expect(logger.debug.args.some(args => args.join(' ').includes('[Blockchain] Time (end)'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates txid', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      await expect(wrapper.time()).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.time(null)).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.time('abc')).to.be.rejectedWith('Invalid txid')
      await expect(wrapper.time({})).to.be.rejectedWith('Invalid txid')
    })

    // ------------------------------------------------------------------------

    it('validates response', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      blockchain.time.returns('abc')
      await expect(wrapper.time(txid)).to.be.rejectedWith('Invalid time')
      blockchain.time.returns(-1)
      await expect(wrapper.time(txid)).to.be.rejectedWith('Invalid time')
    })

    // ------------------------------------------------------------------------

    it('gets from cache if exists', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      const time = Date.now()
      await wrapper.cache.set(`time://${txid}`, time)
      const response = await wrapper.time(txid)
      expect(response).to.deep.equal(time)
    })

    // ------------------------------------------------------------------------

    it('caches time', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      const txid = '1111111111111111111111111111111111111111111111111111111111111111'
      const time = Date.now()
      blockchain.time.returns(time)
      await wrapper.time(txid)
      const value = await wrapper.cache.get(`time://${txid}`)
      expect(value).to.deep.equal(time)
    })
  })

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  describe('setWrappingEnabled', () => {
    it('disable', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      wrapper.setWrappingEnabled(false)
      await wrapper.fetch('abc')
    })

    // ------------------------------------------------------------------------

    it('reenable', async () => {
      const blockchain = stubBlockchain()
      const wrapper = new BlockchainWrapper(blockchain)
      wrapper.setWrappingEnabled(false)
      wrapper.setWrappingEnabled(true)
      await expect(wrapper.fetch('abc')).to.be.rejected
    })
  })
})

// ------------------------------------------------------------------------------------------------
