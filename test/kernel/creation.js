/**
 * creation.js
 *
 * Tests for lib/kernel/creation.js
 */

const { describe, it } = require('mocha')
const Run = require('../env/run')
const { expectTx } = require('../env/misc')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const LocalCache = require('../../lib/plugins/local-cache')
const { Jig, Berry, Creation } = Run

// ------------------------------------------------------------------------------------------------
// Creation
// ------------------------------------------------------------------------------------------------

describe('Creation', () => {
  // --------------------------------------------------------------------------
  // hasInstance
  // --------------------------------------------------------------------------

  describe('hasInstance', () => {
    it('jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      expect(a instanceof Creation).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('code', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      expect(CA instanceof Creation).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('sidekick class', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(CA instanceof Creation).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('sidekick function', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      expect(cf instanceof Creation).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { }
      const b = await B.load('abc')
      expect(b instanceof Creation).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('undeployed code', () => {
      class A { }
      class B extends Jig { }
      expect(A instanceof Creation).to.equal(false)
      expect(B instanceof Creation).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('non-jigs', () => {
      expect(1 instanceof Creation).to.equal(false)
      expect(undefined instanceof Creation).to.equal(false)
      expect(null instanceof Creation).to.equal(false)
      expect({} instanceof Creation).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('jigs in jigs', async () => {
      const run = new Run()
      class A extends Jig {
        init () {
          this.x = this instanceof Creation
          this.y = this.constructor instanceof Creation
        }
      }
      A.deps = { Creation }
      const a = new A()
      await a.sync()
      expect(a.x && a.y).to.equal(true)
      const a2 = await run.load(a.location)
      expect(a2.x && a2.y).to.equal(true)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      expect(a3.x && a3.y).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // Bindigns
  // --------------------------------------------------------------------------

  describe('Bindings', () => {
    it('has native bindings', () => {
      expect(Creation.location).to.equal('native://Creation')
      expect(Creation.origin).to.equal('native://Creation')
      expect(Creation.nonce).to.equal(0)
      expect(Creation.owner).to.equal(null)
      expect(Creation.satoshis).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // Jigs
  // --------------------------------------------------------------------------

  describe('Jigs', () => {
    it('pass into jig method', async () => {
      const run = new Run()
      class A extends Jig {
        f (Creation) { this.Creation = Creation }
      }
      const a = new A()
      await a.sync()
      expectTx({
        nin: 1,
        ref: [
          'native://Creation',
          A.location
        ],
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'f', [{ $jig: 1 }]]
          }
        ]
      })
      a.f(Creation)
      await a.sync()
      expect(a.Creation).to.equal(Creation)
      const a2 = await run.load(a.location)
      expect(a2.Creation).to.equal(Creation)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      expect(a3.Creation).to.equal(Creation)
    })
  })

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('reference as code property', async () => {
      const run = new Run()
      class A extends Jig { }
      A.Creation = Creation
      const CA = run.deploy(A)
      await run.sync()
      expect(CA.Creation).to.equal(Creation)
      const CA2 = await run.load(CA.location)
      expect(CA2.Creation).to.equal(Creation)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.Creation).to.equal(Creation)
    })

    // ------------------------------------------------------------------------

    it('throws if deploy direct extension', async () => {
      const run = new Run()
      class A extends Creation { }
      expect(() => run.deploy(A)).to.throw('Creation is sealed')
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade direct extension', async () => {
      const run = new Run()
      class A {}
      const CA = run.deploy(A)
      class B extends Creation { }
      expect(() => CA.upgrade(B)).to.throw('Creation is sealed')
    })
  })
})

// ------------------------------------------------------------------------------------------------
