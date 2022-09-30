/**
 * lock.js
 *
 * Tests for custom owner locks
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { expectTx } = require('../env/misc')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Lock
// ------------------------------------------------------------------------------------------------

describe('Lock', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  describe('Create', () => {
    it('simple lock deployed', async () => {
      const run = new Run()
      const L = await run.deploy(class L {
        script () { return '' }
        domain () { return 0 }
      }).sync()
      run.owner = { sign: x => x, nextOwner: () => new L() }
      class A { }
      expectTx({
        nin: 0,
        nref: 1,
        nout: 1,
        ndel: 0,
        cre: [
          { $arb: {}, T: { $jig: 0 } }
        ],
        exec: [
          {
            op: 'DEPLOY',
            data: [A.toString(), { deps: {} }]
          }
        ]
      })
      const CA = run.deploy(A)
      await run.sync()
      function test (A) { expect(A.owner instanceof L).to.equal(true) }
      test(CA)
      const CA2 = await run.load(A.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(A.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('simple lock deploying', async () => {
      const run = new Run()
      const L = run.deploy(class L {
        script () { return '' }
        domain () { return 0 }
      })
      run.owner = { sign: x => x, nextOwner: () => new L() }
      const A = run.deploy(class A { })
      await run.sync()
      function test (A) { expect(A.owner instanceof L).to.equal(true) }
      test(A)
      const A2 = await run.load(A.location)
      test(A2)
      run.cache = new LocalCache()
      const A3 = await run.load(A.location)
      test(A3)
    })

    // ------------------------------------------------------------------------

    it('simple lock local', async () => {
      const run = new Run()
      class L {
        script () { return '' }
        domain () { return 0 }
      }
      const CL = await run.deploy(L).sync()
      run.owner = { sign: x => x, nextOwner: () => new L() }
      const A = run.deploy(class A { })
      await run.sync()
      function test (A) {
        expect(A.owner instanceof L).to.equal(true)
        expect(A.owner instanceof CL).to.equal(true)
      }
      test(A)
      const A2 = await run.load(A.location)
      test(A2)
      run.cache = new LocalCache()
      const A3 = await run.load(A.location)
      test(A3)
    })

    // ------------------------------------------------------------------------

    it('simple lock undeployed', async () => {
      const run = new Run()
      class L {
        script () { return '' }
        domain () { return 0 }
      }
      run.owner = { sign: x => x, nextOwner: () => new L() }
      class A { }
      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        cre: [
          { $arb: {}, T: { $jig: 1 } },
          { $arb: {}, T: { $jig: 1 } }
        ],
        exec: [
          {
            op: 'DEPLOY',
            data: [A.toString(), { deps: {} }]
          },
          {
            op: 'DEPLOY',
            data: [L.toString(), { deps: {} }]
          }
        ]
      })
      const CA = run.deploy(A)
      await run.sync()
      const CL = Run.util.install(L)
      function test (A) {
        expect(A.owner instanceof CL).to.equal(true)
        expect(A.owner.constructor.owner instanceof CL).to.equal(true)
      }
      test(CA)
      const CA2 = await run.load(A.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(A.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('assign lock deployed in transaction', async () => {
      const run = new Run()
      class L {
        script () { return '' }
        domain () { return 0 }
      }
      run.owner = { sign: x => x, nextOwner: () => new L() }
      class A { }
      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        cre: [
          { $arb: {}, T: { $jig: 0 } },
          { $arb: {}, T: { $jig: 0 } }
        ],
        exec: [
          {
            op: 'DEPLOY',
            data: [L.toString(), { deps: {} }]
          },
          {
            op: 'DEPLOY',
            data: [A.toString(), { deps: {} }]
          }
        ]
      })
      run.transaction(() => {
        run.deploy(L)
        run.deploy(A)
      })
      await run.sync()
      await run.load(A.location)
      run.cache = new LocalCache()
      await run.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('newly deployed lock goes into inventory', async () => {
      const run = new Run({ cache: new Run.plugins.LocalCache() })
      class L {
        script () { return '' }
        domain () { return 0 }
      }
      run.owner = { sign: x => x, nextOwner: () => new L() }
      run.deploy(class A {})
      await run.sync()
      await run.inventory.sync()
      expect(run.inventory.code.length).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('script() reads a jig', async () => {
      const run = new Run()
      class A { }
      A.script = ''
      run.deploy(A)
      class L {
        script () { return A.script }
        domain () { return 0 }
      }
      L.deps = { A }
      const CL = run.deploy(L)
      await run.sync()
      run.owner = { sign: x => x, nextOwner: () => new CL() }
      class B { }
      expectTx({
        nin: 0,
        ref: [
          L.location,
          A.location
        ],
        nout: 1,
        ndel: 0,
        cre: [
          { $arb: {}, T: { $jig: 0 } }
        ],
        exec: [
          {
            op: 'DEPLOY',
            data: [B.toString(), { deps: {} }]
          }
        ]
      })
      run.deploy(B)
      await run.sync()
      await run.load(B.location)
      run.cache = new LocalCache()
      await run.load(B.location)
    })
  })

  // --------------------------------------------------------------------------
  // Method
  // --------------------------------------------------------------------------

  describe('Method', () => {
    it('cloned when assigned from another jig', async () => {
      const run = new Run()

      const CustomLock = await run.deploy(
        class CustomLock {
          script () { return '' }
          domain () { return 0 }
        }
      ).sync()

      class A extends Jig { init () { this.owner = new CustomLock() }}
      A.deps = { CustomLock }

      const a = new A()
      await a.sync()

      class B extends Jig {
        static f (a) { this.owner = a.owner; this.owner.n = 1 }
      }
      const CB = run.deploy(B)
      CB.f(a)
      await CB.sync()

      function test (a, B) {
        expect(typeof a.n).to.equal('undefined')
        expect(B.owner.n).to.equal(1)
      }

      test(a, CB)

      const a2 = await run.load(a.location)
      const CB2 = await run.load(CB.location)
      test(a2, CB2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      const CB3 = await run.load(CB.location)
      test(a3, CB3)
    })
  })
})

// ------------------------------------------------------------------------------------------------
