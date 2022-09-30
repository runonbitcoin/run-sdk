/**
 * pay-server.js
 *
 * Tests for lib/plugins/pay-server.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const bsv = require('bsv')
const { HDPrivateKey, Transaction } = bsv
const Run = require('../env/run')
const { STRESS, API, NETWORK } = require('../env/config')
const { Jig } = Run
const { PayServer, PurseWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Keys
// ------------------------------------------------------------------------------------------------

const apiKeys = {
  main: 'xpub68bsAQGp2VLopL8t4EowTRKtfPRpZKwiAENYckkGbXm3WHcqdCYx4aCVP6fY4GgQ7QK25XLpMenJeMHLEiZTf5XjQQKd1yNBvXhSMc6oxKe',
  test: 'tpubD9fidjoMPrsVEnYutakv62cR6acAAfWW5hTfgrEoedyijTiVkPnnkq2VyvUpx5WnssWLDrCsHYEKMvmp1nQSj8kH2AGhyeyAw1Fb3wiy8Bh'
}

const apiKey = apiKeys[NETWORK] || new HDPrivateKey().toString()

// ------------------------------------------------------------------------------------------------
// PayServer
// ------------------------------------------------------------------------------------------------

describe('PayServer', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is PurseWrapper', () => {
      expect(new PayServer(apiKey) instanceof PurseWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('should detect network on mainnet', () => {
      const purse = new PayServer(apiKeys.main)
      expect(purse.network).to.equal('main')
    })

    // ------------------------------------------------------------------------

    it('should detect network on testnet', () => {
      const purse = new PayServer(apiKeys.test)
      expect(purse.network).to.equal('test')
    })

    // ------------------------------------------------------------------------

    it('should fail for invalid api keys', () => {
      expect(() => new PayServer('')).to.throw('Invalid API key')
      expect(() => new PayServer(null)).to.throw('Invalid API key')
      expect(() => new PayServer(0)).to.throw('Invalid API key')
      expect(() => new PayServer(true)).to.throw('Invalid API key')
    })
  })

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  describe('pay', () => {
    it('makes api call', async () => {
      const purse = new PayServer(apiKey)
      const run = new Run({ purse })
      class A {}
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ pay: false, sign: false })
      purse.request = stub().returns({ rawtx })
      await tx.pay()
      expect(purse.request.callCount).to.equal(1)
      expect(purse.request.firstCall.firstArg).to.deep.equal(`${purse.host}/v1/${purse.network}/pay`)
    })
  })

  // --------------------------------------------------------------------------
  // live
  // --------------------------------------------------------------------------

  describe('live', () => {
    // Only run the live tests on testnet with run api
    if (NETWORK !== 'test' || API !== 'run') return

    it('pay for jig transactions', async () => {
      const purse = new PayServer(apiKey)
      const run = new Run({ purse })
      class A extends Jig { f () { this.n = 1 } }
      const a = new A()
      a.f()
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('pay for non-standard inputs', async () => {
      class CustomLock {
        script () { return '' }
        domain () { return 1 }
      }

      class CustomKey {
        nextOwner () { return new CustomLock() }

        sign (rawtx, parents, locks) {
          const tx = new Transaction(rawtx)
          locks[0] && tx.inputs[0].setScript('OP_1')
          return tx.toString('hex')
        }
      }

      const purse = new PayServer(apiKey)
      const run = new Run({ purse, owner: new CustomKey() })

      run.deploy(CustomLock)
      await run.sync()

      class A extends Jig {
        init (owner) { this.owner = owner }
        send (to) { this.owner = to }
      }

      const a = new A(new CustomLock())
      await run.sync()

      a.send(new CustomLock())
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if API key not recognized', async () => {
      const run = new Run()
      const badApiKey = new HDPrivateKey().hdPublicKey.toString()
      run.purse = new PayServer(badApiKey)
      class A extends Jig { }
      run.deploy(A)
      await expect(run.sync()).to.be.rejectedWith('API key not recognized')
    })

    // ------------------------------------------------------------------------

    if (STRESS) {
      it('stress test', async () => {
        // Post 120 transactions over 2 minutes
        const purse = new PayServer(apiKey)
        const run = new Run({ purse })
        class A extends Jig { f () { this.n = 1 } }
        const a = new A()
        for (let i = 0; i < 120; i++) {
          console.log('posting', i, 'of 120')
          a.f()
          await run.sync()
        }
      })
    }
  })
})

// ------------------------------------------------------------------------------------------------
