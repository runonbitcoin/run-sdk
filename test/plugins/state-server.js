/**
 * state-server.js
 *
 * Tests for lib/plugins/state-server.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const { stub } = require('sinon')
const Run = require('../env/run')
const { NETWORK } = require('../env/config')
const { StateServer, StateWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// StateServer
// ------------------------------------------------------------------------------------------------

describe('StateServer', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is StateWrapper', () => {
      expect(new StateServer() instanceof StateWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('creates with defaults', () => {
      const connect = new StateServer()
      expect(connect.network).to.equal('main')
    })

    // ------------------------------------------------------------------------

    it('create on supported network', () => {
      const mainnetConnect = new StateServer({ network: 'main' })
      expect(mainnetConnect.network).to.equal('main')
      const testnetConnect = new StateServer({ network: 'test' })
      expect(testnetConnect.network).to.equal('test')
    })

    // ------------------------------------------------------------------------

    it('throws if unsupported network', () => {
      expect(() => new StateServer({ network: '' })).to.throw('RunConnect API does not support the "" network')
      expect(() => new StateServer({ network: 'stn' })).to.throw('RunConnect API does not support the "stn" network')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid network', () => {
      expect(() => new StateServer({ network: null })).to.throw('Invalid network: null')
      expect(() => new StateServer({ network: 0 })).to.throw('Invalid network: 0')
    })
  })

  // --------------------------------------------------------------------------
  // pull
  // --------------------------------------------------------------------------

  describe('pull', () => {
    it('makes api call with all=0 and tx=0', async () => {
      const stateServer = new StateServer({ network: 'main' })
      stateServer.request = stub().returns({ abc: 'def' })
      const options = { all: false, tx: false }
      await stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2', options)
      expect(stateServer.request.callCount).to.equal(1)
      expect(stateServer.request.firstCall.firstArg.startsWith(`${stateServer.host}/v1/main/state/bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2?all=0&tx=0&filter=`)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('makes api call with all=1 and tx=1', async () => {
      const stateServer = new StateServer({ network: 'main' })
      stateServer.request = stub().returns({ abc: 'def' })
      const options = { all: true, tx: true }
      await stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2', options)
      expect(stateServer.request.callCount).to.equal(1)
      expect(stateServer.request.firstCall.firstArg.startsWith(`${stateServer.host}/v1/main/state/bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2?all=1&tx=1&filter=`)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('caches entries on 404 error', async () => {
      const stateServer = new StateServer({ network: 'main' })
      stateServer.request = stub().throws({ reason: { abc: 'def' }, status: 404 })
      await stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2')
      expect(stateServer.request.callCount).to.equal(1)
      expect(await stateServer.cache.get('abc')).to.equal('def')
    })

    // ------------------------------------------------------------------------

    it('caches entries on non-404 error', async () => {
      const stateServer = new StateServer({ network: 'main' })
      stateServer.request = stub().throws({ reason: { abc: 'def' }, status: 500 })
      await expect(stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2')).to.be.rejected
      expect(stateServer.request.callCount).to.equal(1)
      expect(await stateServer.cache.get('abc')).to.equal('def')
    })

    // ------------------------------------------------------------------------

    it('does not cache entries if none returned on error', async () => {
      const stateServer = new StateServer({ network: 'main' })
      stateServer.cache = new Map()
      stateServer.request = stub().throws({ reason: 'hello', status: 500 })
      await expect(stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2')).to.be.rejected
      expect(stateServer.request.callCount).to.equal(1)
      expect(stateServer.cache.size).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('non-state keys do not pull', async () => {
      const stateServer = new StateServer({ network: 'test' })
      stateServer.request = stub()
      await stateServer.pull('trust://abc')
      expect(stateServer.request.callCount).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // live
  // --------------------------------------------------------------------------

  describe('live', () => {
    if (NETWORK !== 'main') return

    it('gets all states and transactions', async () => {
      const stateServer = new StateServer()
      const state = await stateServer.pull('jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2', { all: true, tx: true })
      expect(typeof state).to.equal('object')
      const expectedKeys = [
        'jig://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92_o2',
        'jig://369c892dcbc19e69f5c73d8055c99b98c1a56da4086c666497c2136b8b5c2253_o1',
        'jig://72a61eb990ffdb6b38e5f955e194fed5ff6b014f75ac6823539ce5613aea0be8_o1',
        'tx://72a61eb990ffdb6b38e5f955e194fed5ff6b014f75ac6823539ce5613aea0be8',
        'jig://d6170025a62248d8df6dc14e3806e68b8df3d804c800c7bfb23b0b4232862505_o1',
        'jig://81bcef29b0e4ed745f3422c0b764a33c76d0368af2d2e7dd139db8e00ee3d8a6_o1',
        'tx://81bcef29b0e4ed745f3422c0b764a33c76d0368af2d2e7dd139db8e00ee3d8a6',
        'jig://727e7b423b7ee40c0b5be87fba7fa5673ea2d20a74259040a7295d9c32a90011_o1',
        'tx://727e7b423b7ee40c0b5be87fba7fa5673ea2d20a74259040a7295d9c32a90011',
        'jig://49145693676af7567ebe20671c5cb01369ac788c20f3b1c804f624a1eda18f3f_o1',
        'tx://49145693676af7567ebe20671c5cb01369ac788c20f3b1c804f624a1eda18f3f',
        'jig://3b7ef411185bbe3d01caeadbe6f115b0103a546c4ef0ac7474aa6fbb71aff208_o1',
        'tx://3b7ef411185bbe3d01caeadbe6f115b0103a546c4ef0ac7474aa6fbb71aff208',
        'tx://d6170025a62248d8df6dc14e3806e68b8df3d804c800c7bfb23b0b4232862505',
        'berry://5332c013476cd2a2c18710a01188695bc27a5ef1748a51d4a5910feb1111dab4_o1?berry=2a5b8bd98125efb65e1b1ff7537fb6aaa3e5af5e2149e18cb4630f8ea7682d90&version=5',
        'jig://5332c013476cd2a2c18710a01188695bc27a5ef1748a51d4a5910feb1111dab4_o1',
        'jig://312985bd960ae4c59856b3089b04017ede66506ea181333eec7c9bb88b11c490_o1',
        'jig://312985bd960ae4c59856b3089b04017ede66506ea181333eec7c9bb88b11c490_o2',
        'tx://312985bd960ae4c59856b3089b04017ede66506ea181333eec7c9bb88b11c490',
        'tx://5332c013476cd2a2c18710a01188695bc27a5ef1748a51d4a5910feb1111dab4',
        'tx://369c892dcbc19e69f5c73d8055c99b98c1a56da4086c666497c2136b8b5c2253',
        'tx://bf5506e4d752cb2a2fa1d4140368e5c226004567fcd8f8cccc25f13de49b3b92'
      ]
      for (const key of expectedKeys) {
        const data = await stateServer.cache.get(key)
        expect(typeof data).not.to.equal('undefined')
      }
    })

    // ------------------------------------------------------------------------

    it('gets transaction data if state is missing', async () => {
      const berryTxid = '2a5b8bd98125efb65e1b1ff7537fb6aaa3e5af5e2149e18cb4630f8ea7682d90'
      const stateServer = new StateServer()
      const state = await stateServer.pull(`jig://${berryTxid}_o1`, { all: true, tx: true })
      expect(typeof state).to.equal('undefined')
      const rawtx = await stateServer.cache.get(`tx://${berryTxid}`)
      expect(typeof rawtx).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('returns error if connection down', async () => {
      const stateServer = new StateServer()
      stateServer.request = stub().throws(new Error('Bad request'))
      const location = '3b7ef411185bbe3d01caeadbe6f115b0103a546c4ef0ac7474aa6fbb71aff208_o1'
      await expect(stateServer.pull('jig://' + location)).to.be.rejectedWith('Bad request')
    })
  })
})

// ------------------------------------------------------------------------------------------------
