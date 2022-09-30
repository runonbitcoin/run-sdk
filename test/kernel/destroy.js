/**
 * destroy.js
 *
 * Tests for destroy functionality
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { PrivateKey } = require('bsv')
const Run = require('../env/run')
const { Jig, Berry, Code } = Run
const { LocalCache } = Run.plugins
const { expectTx } = require('../env/misc')
const { stub } = require('sinon')

// ------------------------------------------------------------------------------------------------
// Destroy
// ------------------------------------------------------------------------------------------------

describe('Destroy', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('destroys code', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      function test (CA) {
        expect(CA.location.endsWith('_d0')).to.equal(true)
        expect(CA.owner).to.equal(null)
        expect(CA.satoshis).to.equal(0)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 0,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'destroy', []]
          }
        ]
      })

      expect(CA.destroy()).to.equal(CA)
      expect(CA.owner).to.equal(null)
      expect(CA.satoshis).to.equal(0)

      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('destroy twice', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      CA.destroy()
      await CA.sync()
      const lastLocation = CA.location

      expect(CA.destroy()).to.equal(CA)
      await CA.sync()
      expect(CA.location).to.equal(lastLocation)
    })

    // ------------------------------------------------------------------------

    it('destroy in a static method', async () => {
      const run = new Run()
      class A { static f () { A.destroy() } }
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 1,
        nref: 0,
        nout: 0,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'destroy', []]
          }
        ]
      })

      CA.f()
      await CA.sync()
      await run.load(CA.location)
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('destroy jig in a code method', async () => {
      const run = new Run()
      class A extends Jig { static f (a) { a.destroy() } }
      const CA = run.deploy(A)
      const a = new A()
      await a.sync()

      expectTx({
        nin: 2,
        nref: 0,
        nout: 1,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'f', [{ $jig: 1 }]]
          }
        ]
      })

      CA.f(a)
      await CA.sync()

      await run.load(CA.location)

      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy non-code', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      const error = 'destroy unavailable'
      expect(() => CA.destroy.apply(A, [])).to.throw(error)
      expect(() => Code.prototype.destroy.call({})).to.throw(error)
      expect(() => Code.prototype.destroy.call(class A { })).to.throw(error)
      expect(() => Code.prototype.destroy.call(null)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy non-code children', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()
      class B extends CA { }
      expect(() => B.destroy()).to.throw('destroy unavailable')
      expect(() => Code.prototype.destroy.call(B)).to.throw('destroy unavailable')
    })

    // --------------------------------------------------------------------------

    it('destroy jig not synced', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CA.destroy()
      await CA.sync()
    })

    // ------------------------------------------------------------------------

    it('rollback if error', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()
      stub(run.blockchain, 'broadcast').throwsException()
      CA.destroy()
      await expect(CA.sync()).to.be.rejected
      expect(CA.location.endsWith('_d0')).to.equal(false)
      expect(CA.nonce).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('destroy multiple in a batch', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      run.transaction(() => {
        a.destroy()
        a.constructor.destroy()
      })
      await run.sync()
      function test (a) {
        expect(a.nonce).to.equal(2)
        expect(a.constructor.nonce).to.equal(2)
        expect(a.location.endsWith('_d0')).to.equal(true)
        expect(a.constructor.location.endsWith('_d1')).to.equal(true)
      }
      test(a)
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('throws if send then destroy in batch', async () => {
      const run = new Run()
      class A extends Jig { send (owner) { this.owner = owner } }
      const a = new A()
      await a.sync()
      expect(() => run.transaction(() => {
        a.send(run.owner.address)
        a.destroy()
      })).to.throw('delete disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if back then destroy in batch', async () => {
      const run = new Run()
      class A extends Jig { back () { this.satoshis = 0 } }
      const a = new A()
      await a.sync()
      expect(() => run.transaction(() => {
        a.back()
        a.destroy()
      })).to.throw('delete disabled: [jig A] has an unbound owner or satoshis value')
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('destroys jig', async () => {
      const run = new Run()

      class A extends Jig { }
      const a = new A()
      await a.sync()

      function test (a) {
        expect(a.location.endsWith('_d0')).to.equal(true)
        expect(a.owner).to.equal(null)
        expect(a.satoshis).to.equal(0)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 0,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'destroy', []]
          }
        ]
      })

      expect(a.destroy()).to.equal(a)
      expect(a.owner).to.equal(null)
      expect(a.satoshis).to.equal(0)

      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('allowed to change properties after destroy', async () => {
      const run = new Run()

      class A extends Jig {
        init () { this.n = 1 }
        f () { this.destroy(); delete this.n; this.m = 2 }
      }

      const a = new A()
      a.f()
      await a.sync()

      function test (a) {
        expect(typeof a.n).to.equal('undefined')
        expect(a.m).to.equal(2)
      }

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('throws to change properties after destroy and finalize', () => {
      new Run() // eslint-disable-line

      class A extends Jig {
        f () { this.destroy() }
        h (b) { b.g(this); delete this.n }
      }

      class B extends Jig {
        g (a) {
          a.f()
        }
      }

      const a = new A()
      const b = new B()
      expect(() => a.h(b)).to.throw('Cannot delete n: unbound')
    })

    // ------------------------------------------------------------------------

    it('create and destroy may still set properties', async () => {
      const run = new Run()
      class A extends Jig {
        init () {
          this.destroy()
          this.n = 1
        }
      }
      const a = new A()
      expect(a.n).to.equal(1)
      await a.sync()
      const a2 = await run.load(a.location)
      expect(a2.n).to.equal(1)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      expect(a3.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('throws if change owner or satoshis after destroy', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f () {
          this.destroy()
          this.satoshis = 100
        }

        g (addr) {
          this.destroy()
          this.owner = addr
        }
      }
      const a = new A()
      expect(() => a.f()).to.throw('Cannot set satoshis')
      const b = new A()
      const addr = new PrivateKey().toAddress().toString()
      expect(() => b.g(addr)).to.throw('Cannot set owner')
    })

    // ------------------------------------------------------------------------

    it('create and destroy in same transaction', async () => {
      const run = new Run()
      class A extends Jig { init () { this.destroy() } }
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 0,
        nref: 1,
        nout: 0,
        ndel: 1,
        ncre: 1,
        exec: [
          {
            op: 'NEW',
            data: [{ $jig: 0 }, []]
          }
        ]
      })

      function test (a) {
        expect(a.location).to.equal(a.origin)
        expect(a.location.endsWith('_d0')).to.equal(true)
      }

      const a = new A()
      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('destroys code in method', async () => {
      const run = new Run()

      class A extends Jig { f (B) { B.destroy() } }
      class B { }
      const a = new A()
      const CB = run.deploy(B)
      await a.sync()
      await CB.sync()

      expectTx({
        nin: 2,
        nref: 1,
        nout: 1,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'f', [{ $jig: 1 }]]
          }
        ]
      })

      function test (B) {
        expect(B.location).not.to.equal(B.origin)
        expect(B.location.endsWith('_d0')).to.equal(true)
      }

      a.f(CB)
      await a.sync()
      test(CB)

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy non-jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      expect(() => a.destroy.apply({}, [])).to.throw('destroy unavailable')
      expect(() => Jig.prototype.destroy.apply(A, [])).to.throw('destroy unavailable')
    })

    // ------------------------------------------------------------------------

    it('send and destroy in same method', async () => {
      // destroy is a request to happen at method start
      new Run() // eslint-disable-line
      class A extends Jig { f (owner) { this.owner = owner; this.destroy() } }
      const a = new A()
      await a.sync()
      const owner = new PrivateKey().toPublicKey().toString()
      expect(() => a.f(owner)).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('destroy twice in same method', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.destroy(); this.destroy() } }
      const a = new A()
      await a.sync()
      expect(() => a.f()).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('destroy twice in a batch', async () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      await CA.sync()
      run.transaction(() => {
        CA.destroy()
        CA.destroy()
      })
      await run.sync()
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('can destroy berry class', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()

      expectTx({
        nin: 1,
        nref: 0,
        nout: 0,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'destroy', []]
          }
        ]
      })

      async function test (CB) {
        expect(CB.location.endsWith('_d0')).to.equal(true)
        expect(CB.nonce).to.equal(2)
        await CB.load('abc')
      }

      CB.destroy()
      await CB.sync()
      await test(CB)

      const CB2 = await run.load(CB.location)
      await test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      await test(CB3)
    })

    // ------------------------------------------------------------------------

    it('can destroy berry class in jig method', async () => {
      const run = new Run()

      class A extends Jig { f (b) { b.constructor.destroy() } }
      const a = new A()
      await a.sync()

      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()

      expectTx({
        nin: 2,
        nref: 2,
        nout: 1,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'f', [{ $jig: 2 }]]
          }
        ]
      })

      async function test (CB) {
        expect(CB.location.endsWith('_d0')).to.equal(true)
        expect(CB.nonce).to.equal(2)
        await CB.load('abc')
      }

      const b = await CB.load('abc')
      a.f(b)
      await a.sync()
      await test(CB)

      const CB2 = await run.load(CB.location)
      await test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      await test(CB3)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy undeployed berry class', async () => {
      const run = new Run()
      class B extends Berry { }
      const b = await B.load('abc')
      b.constructor.destroy()
      await expect(run.sync()).to.be.rejectedWith('Bad location')
    })
  })
})

// ------------------------------------------------------------------------------------------------
