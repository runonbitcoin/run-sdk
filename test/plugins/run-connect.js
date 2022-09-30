/**
 * run-connect.js
 *
 * Tests for lib/plugins/run-connect.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const Run = require('../env/run')
const { RunConnect, BlockchainWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// RunConnect
// ------------------------------------------------------------------------------------------------

describe('RunConnect', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is BlockchainWrapper', () => {
      expect(new RunConnect() instanceof BlockchainWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('creates with defaults', () => {
      const connect = new RunConnect()
      expect(connect.network).to.equal('main')
      expect(connect.api).to.equal('run')
    })

    // --------------------------------------------------------------------------------------------

    it('create on supported network', () => {
      const mainnetConnect = new RunConnect({ network: 'main' })
      expect(mainnetConnect.network).to.equal('main')
      const testnetConnect = new RunConnect({ network: 'test' })
      expect(testnetConnect.network).to.equal('test')
    })

    // --------------------------------------------------------------------------------------------

    it('throws if unsupported network', () => {
      expect(() => new RunConnect({ network: '' })).to.throw('RunConnect API does not support the "" network')
      expect(() => new RunConnect({ network: 'stn' })).to.throw('RunConnect API does not support the "stn" network')
    })

    // --------------------------------------------------------------------------------------------

    it('throws if invalid network', () => {
      expect(() => new RunConnect({ network: null })).to.throw('Invalid network: null')
      expect(() => new RunConnect({ network: 0 })).to.throw('Invalid network: 0')
    })
  })
})

// ------------------------------------------------------------------------------------------------
