/**
 * mockchain.js
 *
 * Tests for lib/plugins/mockchain.js
 */

const { PrivateKey, Transaction, Script } = require('bsv')
const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { STRESS } = require('../env/config')
const { Mockchain, BlockchainWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Mockchain Functional Tests
// ------------------------------------------------------------------------------------------------

describe('Mockchain', () => {
  it('is BlockchainWrapper', () => {
    expect(new Mockchain() instanceof BlockchainWrapper).to.equal(true)
  })

  // ------------------------------------------------------------------------

  describe('mempoolChainLimit', () => {
    it('disable', async () => {
      const mockchain = new Mockchain()
      mockchain.mempoolChainLimit = Infinity

      const privkey = new PrivateKey('testnet')
      const address = privkey.toAddress()
      const script = Script.fromAddress(address)
      mockchain.fund(address, 100000000)

      for (let i = 0; i < 50; i++) {
        const utxo = (await mockchain.utxos(script))[0]
        const tx = new Transaction().from(utxo).change(address).sign(privkey)
        await mockchain.broadcast(tx)
      }
    })
  })

  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('bsv transaction', async () => {
      const mockchain = new Mockchain()
      const privkey = new PrivateKey('testnet')
      const address = privkey.toAddress()
      const fundtxid = mockchain.fund(address, 100000000)
      const fundraw = await mockchain.fetch(fundtxid)
      const fundtx = new Transaction(fundraw)
      const fundout = fundtx.outputs[1]
      const fundutxo = { txid: fundtxid, vout: 1, satoshis: fundout.satoshis, script: fundout.script }
      const tx = new Transaction().from(fundutxo).change(address).sign(privkey)
      await mockchain.broadcast(tx)
    })
  })

  // --------------------------------------------------------------------------

  describe('block', () => {
    it('respects 1000 chain limit', async function () {
      this.timeout(30000)
      const mockchain = new Mockchain()
      const privkey = new PrivateKey('testnet')
      const address = privkey.toAddress()
      const script = Script.fromAddress(address)
      mockchain.fund(address, 100000000)

      for (let i = 0; i < 1000; i++) {
        const utxo = (await mockchain.utxos(script))[0]
        const tx = new Transaction().from(utxo).change(address).sign(privkey)
        await mockchain.broadcast(tx)
      }
      const utxo = (await mockchain.utxos(script))[0]
      const tx = new Transaction().from(utxo).change(address).sign(privkey)
      await expect(mockchain.broadcast(tx)).to.be.rejectedWith('too-long-mempool-chain')
      mockchain.block()
      await mockchain.broadcast(tx)
    })
  })

  // --------------------------------------------------------------------------

  describe('fund', () => {
    it('funds directly', async () => {
      const mockchain = new Mockchain()
      const address = new PrivateKey('testnet').toAddress()
      const txid = mockchain.fund(address, 10000)
      const utxos = await mockchain.utxos(Script.fromAddress(address))
      expect(txid).to.equal(utxos[0].txid)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Mockchain Stress Tests
// ------------------------------------------------------------------------------------------------

if (STRESS) {
  describe('Mockchain Performance', () => {
    it('fast broadcasts', async () => {
      const mockchain = new Mockchain()
      const privkey = new PrivateKey('testnet')
      const address = privkey.toAddress()
      const script = Script.fromAddress(address)
      mockchain.fund(address, 100000000)

      const utxo = (await mockchain.utxos(script))[0]
      const start = new Date()
      const tx = new Transaction().from(utxo).change(address).sign(privkey)
      await mockchain.broadcast(tx)
      expect(new Date() - start < 30).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('fast fetches', async () => {
      const mockchain = new Mockchain()
      const privkey = new PrivateKey('testnet')
      const address = privkey.toAddress()
      const script = Script.fromAddress(address)
      mockchain.fund(address, 100000000)

      let utxo = (await mockchain.utxos(script))[0]
      const earlyTxid = utxo.txid
      const measures = []
      for (let i = 0; i < 1000; i++) {
        const tx = new Transaction().from(utxo).change(address).sign(privkey)
        utxo = { txid: tx.hash, vout: 0, script: tx.outputs[0].script, satoshis: tx.outputs[0].satoshis }
        await mockchain.broadcast(tx)
        const before = new Date()
        await mockchain.fetch(tx.hash)
        await mockchain.fetch(earlyTxid)
        measures.push(new Date() - before)
        mockchain.block()
      }

      const start = measures.slice(0, 3).reduce((a, b) => a + b, 0) / 3
      const end = measures.slice(measures.length - 3).reduce((a, b) => a + b, 0) / 3
      expect(start < 10).to.equal(true)
      expect(end < 10).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('fast utxo queries', async () => {
      const mockchain = new Mockchain()

      // Generate 10 private keys and fund their addresses
      const privateKeys = []
      for (let i = 0; i < 10; i++) { privateKeys.push(new PrivateKey('testnet')) }
      const addresses = privateKeys.map(privateKey => privateKey.toAddress())
      const scripts = addresses.map(address => Script.fromAddress(address))
      addresses.forEach(address => mockchain.fund(address, 100000))

      // Send from each address to the next, 1000 times
      const measures = []
      for (let i = 0; i < 1000; i++) {
        const before = new Date()
        const utxos = await mockchain.utxos(scripts[i % 10])
        measures.push(new Date() - before)
        const tx = new Transaction().from(utxos).to(addresses[(i + 1) % 10], 1000)
          .change(addresses[i % 10]).sign(privateKeys[i % 10])
        await mockchain.broadcast(tx)
        mockchain.block()
      }

      // Get an average time to query utxos() at the start and end, and check it didn't change much
      const start = measures.slice(0, 3).reduce((a, b) => a + b, 0) / 3
      const end = measures.slice(measures.length - 3).reduce((a, b) => a + b, 0) / 3
      expect(start < 10).to.equal(true)
      expect(end < 10).to.equal(true)
    })
  })
}

// ------------------------------------------------------------------------------------------------
