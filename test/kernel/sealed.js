/**
 * sealed.js
 *
 * Tests for sealed functionality on code
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { expectTx } = require('../env/misc')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Sealed
// ------------------------------------------------------------------------------------------------

describe('Sealed', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Deploy
  // --------------------------------------------------------------------------

  describe('deploy', () => {
    it('owner sealed by default', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 1,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class B extends A { }',
              {
                deps: { A: { $jig: 0 } }
              }
            ]
          }
        ]
      })

      class B extends A { }
      const CB = run.deploy(B)
      await CB.sync()

      await run.load(CB.location)

      run.cache = new LocalCache()
      await run.load(CB.location)
    })

    // ------------------------------------------------------------------------

    it('sealed', async () => {
      const run = new Run()
      class A { }
      A.sealed = true
      const CA = run.deploy(A)
      await CA.sync()
      class B extends A {}
      expect(() => run.deploy(B)).to.throw('A is sealed')
    })

    // ------------------------------------------------------------------------

    it('unsealed', async () => {
      const run = new Run()

      class A { }
      A.sealed = false
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 0,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class B extends A { }',
              {
                deps: { A: { $jig: 0 } }
              }
            ]
          }
        ]
      })

      class B extends A { }
      const CB = run.deploy(B)
      await CB.sync()

      await run.load(CB.location)

      run.cache = new LocalCache()
      await run.load(CB.location)
    })

    // ------------------------------------------------------------------------

    it('grandparent spend required', async () => {
      const run = new Run()

      class A { }
      class B extends A { }
      const CB = run.deploy(B)
      await CB.sync()

      expectTx({
        nin: 2,
        nref: 0,
        nout: 3,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class C extends B { }',
              {
                deps: { B: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      class C extends B { }
      const CC = run.deploy(C)
      await CC.sync()

      await run.load(CC.location)

      run.cache = new LocalCache()
      await run.load(CC.location)
    })

    // ------------------------------------------------------------------------

    it('mixed owner sealed and unsealed', async () => {
      const run = new Run()

      class A { }
      A.sealed = 'owner'
      class B extends A { }
      B.sealed = false
      const CB = run.deploy(B)
      await CB.sync()

      expectTx({
        nin: 1,
        nref: 1,
        nout: 2,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class C extends B { }',
              {
                deps: { B: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      class C extends CB { }
      const CC = run.deploy(C)
      await CC.sync()

      await run.load(CC.location)

      run.cache = new LocalCache()
      await run.load(CC.location)
    })

    // ------------------------------------------------------------------------

    it('throws if sealed and undeployed', () => {
      const run = new Run()
      class A { }
      A.sealed = true
      class B extends A { }
      const error = 'A is sealed'
      expect(() => run.deploy(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid', () => {
      const run = new Run()
      class A { }
      A.sealed = null
      expect(() => run.deploy(A)).to.throw('Invalid sealed option: null')
      A.sealed = 1
      expect(() => run.deploy(A)).to.throw('Invalid sealed option: 1')
    })

    // ------------------------------------------------------------------------

    it('unseal and extend then reseal in a method', async () => {
      const run = new Run()
      class A extends Jig {
        static unseal () { this.sealed = false }
        static seal () { this.sealed = true }
      }
      A.sealed = true
      const CA = run.deploy(A)
      CA.unseal()
      class B extends CA { }
      const CB = run.deploy(B)
      await CB.sync()
      CA.seal()
      class C extends CA { }
      expect(() => run.deploy(C)).to.throw('A is sealed')
      await run.load(CB.location)
      run.cache = new LocalCache()
      await run.load(CB.location)
    })

    // ------------------------------------------------------------------------

    it('sealed with preset', async () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { sealed: true } }
      const CA = run.deploy(A)
      expect(CA.sealed).to.equal(true)
      await CA.sync()
      class B extends A {}
      expect(() => run.deploy(B)).to.throw('A is sealed')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid sealed preset', async () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { sealed: undefined } }
      expect(() => run.deploy(A)).to.throw('Invalid sealed option')
    })
  })

  // --------------------------------------------------------------------------
  // Upgrade
  // --------------------------------------------------------------------------

  describe('upgrade', () => {
    it('owner sealed', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 2,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class B extends A { }',
              {
                deps: { A: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      class B extends CA { }
      CO.upgrade(B)
      await CO.sync()

      await run.load(CO.location)

      run.cache = new LocalCache()
      await run.load(CO.location)
    })

    // ------------------------------------------------------------------------

    it('unsealed', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      class A { }
      A.sealed = false
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class B extends A { }',
              {
                deps: { A: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      class B extends CA { }
      CO.upgrade(B)
      await CO.sync()

      await run.load(CO.location)

      run.cache = new LocalCache()
      await run.load(CO.location)
    })

    // ------------------------------------------------------------------------

    it('grandparent spend required', async () => {
      const run = new Run()

      class A { }
      class B extends A { }
      const CB = run.deploy(B)
      await CB.sync()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      expectTx({
        nin: 3,
        nref: 0,
        nout: 3,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class C extends B { }',
              {
                deps: { B: { $jig: 2 } }
              }
            ]
          }
        ]
      })

      class C extends B { }
      CO.upgrade(C)
      await CO.sync()

      await run.load(CO.location)

      run.cache = new LocalCache()
      await run.load(CO.location)
    })

    // ------------------------------------------------------------------------

    it('mixed owner sealed and unsealed', async () => {
      const run = new Run()

      class A { }
      A.sealed = 'owner'
      class B extends A { }
      B.sealed = false
      const CB = run.deploy(B)
      await CB.sync()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      expectTx({
        nin: 2,
        nref: 1,
        nout: 2,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class C extends B { }',
              {
                deps: { B: { $jig: 2 } }
              }
            ]
          }
        ]
      })

      class C extends CB { }
      CO.upgrade(C)
      await CO.sync()

      await run.load(CO.location)

      run.cache = new LocalCache()
      await run.load(CO.location)
    })

    // ------------------------------------------------------------------------

    it('throws if parent sealed', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)

      class A { }
      A.sealed = true
      const CA = run.deploy(A)

      class B extends CA { }
      const error = 'A is sealed'
      expect(() => CO.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if parent sealed and undeployed', () => {
      const run = new Run()
      class O { }
      const CO = run.deploy(O)
      class A { }
      A.sealed = true
      class B extends A { }
      const error = 'A is sealed'
      expect(() => CO.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade to invalid value', () => {
      const run = new Run()
      class O { }
      const CO = run.deploy(O)
      class A { }
      A.sealed = null
      expect(() => CO.upgrade(A)).to.throw('Invalid sealed option: null')
      A.sealed = 1
      expect(() => CO.upgrade(A)).to.throw('Invalid sealed option: 1')
    })

    // ------------------------------------------------------------------------

    it('unseal and extend then reseal in a method', async () => {
      const run = new Run()
      class A extends Jig {
        static unseal () { this.sealed = false }
        static seal () { this.sealed = true }
      }
      A.sealed = true
      const CA = run.deploy(A)
      CA.unseal()
      class B extends CA { }
      class O extends Jig { }
      const CO = run.deploy(O)
      CO.upgrade(B)
      await CO.sync()
      CA.seal()
      class C extends CA { }
      expect(() => CO.upgrade(C)).to.throw('A is sealed')
      await run.load(CO.location)
      run.cache = new LocalCache()
      await run.load(CO.location)
    })
  })

  // --------------------------------------------------------------------------
  // Method
  // --------------------------------------------------------------------------

  describe('Method', () => {
    it('seal in method', async () => {
      const run = new Run()
      class A extends Jig { static seal () { this.sealed = true } }
      const CA = run.deploy(A)
      await run.deploy(class B extends A { }).sync()
      CA.seal()
      const error = 'A is sealed'
      await run.sync()
      function test (CA) {
        expect(() => run.deploy(class C extends A { }).sync()).to.throw(error)
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('unseal in method', async () => {
      const run = new Run()
      class A extends Jig { static unseal () { this.sealed = false } }
      A.sealed = true
      const CA = run.deploy(A)
      const error = 'A is sealed'
      expect(() => run.deploy(class B extends A { }).sync()).to.throw(error)
      CA.unseal()
      const CC = run.deploy(class C extends A { })
      await run.sync()
      await run.load(CC.location)
      run.cache = new LocalCache()
      await run.load(CC.location)
    })

    // ------------------------------------------------------------------------

    it('owner-seal in method', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { this.sealed = 'owner' }
        static g () { delete this.sealed }
      }
      A.sealed = true
      const CA = run.deploy(A)
      const error = 'A is sealed'
      expect(() => run.deploy(class B extends A { }).sync()).to.throw(error)
      CA.f()
      run.deploy(class C extends A { })
      CA.g()
      run.deploy(class D extends A { })
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if set sealed to invalid value', async () => {
      const run = new Run()

      class A extends Jig {
        static f (x) {
          this.sealed = x
        }

        static g (x) {
          const desc = { configurable: true, enumerable: true, writable: true, value: x }
          Object.defineProperty(this, 'sealed', desc)
        }
      }

      function testInvalid (CA, value) {
        expect(() => CA.f(value)).to.throw('Invalid sealed option')
        expect(() => CA.g(value)).to.throw('Invalid sealed option')
      }

      function test (CA) {
        testInvalid(CA, 123)
        testInvalid(CA, null)
        testInvalid(CA, undefined)
        testInvalid(CA, 'true')
        testInvalid(CA, 'owner2')
        testInvalid(CA, '')
      }

      const CA = run.deploy(A)
      test(CA)
      await run.sync()

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })
  })
})

// ------------------------------------------------------------------------------------------------
