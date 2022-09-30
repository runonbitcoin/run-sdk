/**
 * whatsonchain.js
 *
 * Tests for lib/plugins/whatsonchain.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { NotImplementedError } = Run.errors
const { WhatsOnChain, BlockchainWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// WhatsOnChain
// ------------------------------------------------------------------------------------------------

describe('WhatsOnChain', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is BlockchainWrapper', () => {
      expect(new WhatsOnChain() instanceof BlockchainWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('with defaults', () => {
      const connect = new WhatsOnChain()
      expect(connect.network).to.equal('main')
      expect(connect.api).to.equal('whatsonchain')
    })

    // --------------------------------------------------------------------------------------------

    it('with supported network', () => {
      const mainnet = new WhatsOnChain({ network: 'main' })
      expect(mainnet.network).to.equal('main')
      const testnet = new WhatsOnChain({ network: 'test' })
      expect(testnet.network).to.equal('test')
      const stn = new WhatsOnChain({ network: 'stn' })
      expect(stn.network).to.equal('stn')
    })

    // --------------------------------------------------------------------------------------------

    it('with API key', () => {
      expect(new WhatsOnChain({ apiKey: 'abc' }).apiKey).to.equal('abc')
      expect(new WhatsOnChain({ apiKey: '' }).apiKey).to.equal('')
      expect(new WhatsOnChain({ apiKey: undefined }).apiKey).to.equal(undefined)
    })

    // --------------------------------------------------------------------------------------------

    it('throws if invalid API key', () => {
      expect(() => new WhatsOnChain({ apiKey: null })).to.throw('Invalid API key: null')
      expect(() => new WhatsOnChain({ apiKey: 0 })).to.throw('Invalid API key: 0')
      expect(() => new WhatsOnChain({ apiKey: {} })).to.throw('Invalid API key: [object Object')
    })

    // --------------------------------------------------------------------------------------------

    it('throws if unsupported network', () => {
      expect(() => new WhatsOnChain({ network: '' })).to.throw('WhatsOnChain API does not support the "" network')
      expect(() => new WhatsOnChain({ network: 'mock' })).to.throw('WhatsOnChain API does not support the "mock" network')
    })

    // --------------------------------------------------------------------------------------------

    it('throws if invalid network', () => {
      expect(() => new WhatsOnChain({ network: null })).to.throw('Invalid network: null')
      expect(() => new WhatsOnChain({ network: 0 })).to.throw('Invalid network: 0')
    })
  })

  // --------------------------------------------------------------------------
  // spends
  // --------------------------------------------------------------------------

  describe('spends', () => {
    it('not supported', async () => {
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      const blockchain = new WhatsOnChain({ network: 'main' })
      await expect(blockchain.spends(txid, 0)).to.be.rejectedWith(NotImplementedError)
    })
  })
})

// ------------------------------------------------------------------------------------------------
