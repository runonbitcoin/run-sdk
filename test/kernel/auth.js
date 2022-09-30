/**
 * auth.js
 *
 * Tests for auth functionality
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
// Auth
// ------------------------------------------------------------------------------------------------

describe('Auth', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('spends code', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      function test (CA) {
        expect(CA.origin).not.to.equal(CA.location)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'auth', []]
          }
        ]
      })

      expect(CA.auth()).to.equal(CA)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('auths jig in method', async () => {
      const run = new Run()

      class A extends Jig { static f (b) { b.auth() } }
      class B extends Jig { }
      const CA = run.deploy(A)
      const b = new B()
      await CA.sync()
      await b.sync()

      expectTx({
        nin: 2,
        nref: 1,
        nout: 2,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 1 }, 'f', [{ $jig: 0 }]]
          }
        ]
      })

      function test (b) {
        expect(b.location).not.to.equal(b.origin)
      }

      CA.f(b)
      await CA.sync()
      test(b)

      const b2 = await run.load(b.location)
      test(b2)

      run.cache = new LocalCache()
      const b3 = await run.load(b.location)
      test(b3)
    })

    // --------------------------------------------------------------------------

    it('throws if auths jig destroyed in another transaction', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      CA.destroy()
      await CA.sync()

      expect(() => CA.auth()).to.throw('Cannot auth destroyed jig')
    })

    // --------------------------------------------------------------------------

    it('auths jig not synced', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CA.auth()
      await CA.sync()
    })

    // ------------------------------------------------------------------------

    it('auths in a static method', async () => {
      const run = new Run()
      class A { static f () { A.auth() } }
      const CA = run.deploy(A)
      await CA.sync()

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'auth', []]
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

    it('throws if auth non-code', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      const error = 'auth unavailable'
      expect(() => CA.auth.apply(A, [])).to.throw('auth unavailable')
      expect(() => Code.prototype.auth.call({})).to.throw(error)
      expect(() => Code.prototype.auth.call(class A { })).to.throw(error)
      expect(() => Code.prototype.auth.call(null)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if auths non-code children', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()
      class B extends CA { }
      expect(() => B.auth()).to.throw('auth unavailable')
      expect(() => Code.prototype.auth.call(B)).to.throw('auth unavailable')
    })

    // ------------------------------------------------------------------------

    it('rollback if error', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()
      stub(run.blockchain, 'broadcast').throwsException()
      CA.auth()
      await expect(CA.sync()).to.be.rejected
      expect(CA.location).to.equal(CA.origin)
      expect(CA.nonce).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('auth multiple in a batch', async () => {
      const run = new Run()
      class A { }
      class B extends Berry { }
      class C extends Jig { }
      function f () { }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      const CC = run.deploy(C)
      const cf = run.deploy(f)
      const c = new C()
      await run.sync()
      expectTx({
        nin: 5,
        nref: 0,
        nout: 5,
        ndel: 0,
        ncre: 0,
        exec: [
          { op: 'CALL', data: [{ $jig: 0 }, 'auth', []] },
          { op: 'CALL', data: [{ $jig: 1 }, 'auth', []] },
          { op: 'CALL', data: [{ $jig: 2 }, 'auth', []] },
          { op: 'CALL', data: [{ $jig: 3 }, 'auth', []] },
          { op: 'CALL', data: [{ $jig: 4 }, 'auth', []] }
        ]
      })
      run.transaction(() => {
        CA.auth()
        CB.auth()
        CC.auth()
        cf.auth()
        c.auth()
      })
      await run.sync()
      function test (CA, CB, CC, cf, a) {
        expect(CA.nonce).to.equal(2)
        expect(CB.nonce).to.equal(2)
        expect(CC.nonce).to.equal(2)
        expect(cf.nonce).to.equal(2)
        expect(c.nonce).to.equal(2)
      }
      test(CA, CB, CC, cf, c)
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      const CC2 = await run.load(CC.location)
      const cf2 = await run.load(cf.location)
      const c2 = await run.load(c.location)
      test(CA2, CB2, CC2, cf2, c2)
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      const CC3 = await run.load(CC.location)
      const cf3 = await run.load(cf.location)
      const c3 = await run.load(c.location)
      test(CA3, CB3, CC3, cf3, c3)
    })

    // ------------------------------------------------------------------------

    it('throws if send then auth in batch', async () => {
      const run = new Run()
      class A extends Jig { send (owner) { this.owner = owner } }
      const a = new A()
      await a.sync()
      expect(() => run.transaction(() => {
        a.send(run.purse.address)
        a.auth()
      })).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if back then auth in batch', async () => {
      const run = new Run()
      class A extends Jig { back () { this.satoshis = 1000 } }
      const a = new A()
      await a.sync()
      expect(() => run.transaction(() => {
        a.back()
        a.auth()
      })).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if destroy then auth in batch', async () => {
      const run = new Run()
      class A extends Jig { static send (owner) { this.owner = owner } }
      const CA = run.deploy(A)
      await CA.sync()
      expect(() => run.transaction(() => {
        CA.destroy()
        CA.auth()
      })).to.throw('Cannot auth destroyed jigs')
    })

    // ------------------------------------------------------------------------

    it('throws if send then auth while pending in method', async () => {
      const run = new Run()
      class A extends Jig {
        f (owner) {
          this.owner = owner
          this.auth()
        }
      }
      const a = new A()
      await a.sync()
      expect(() => a.f(run.purse.address)).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if back then auth in separate methods', async () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f () {
          this.satoshis = 1000
          this.auth()
        }
      }
      const a = new A()
      await a.sync()
      expect(() => a.f()).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if send then auth in separate methods', async () => {
      const run = new Run()
      class A extends Jig {
        f (owner) {
          this.owner = owner
        }
      }
      class B extends Jig {
        g (a, owner) {
          a.f(owner)
          a.auth()
        }
      }
      const a = new A()
      const b = new B()
      await run.sync()
      expect(() => b.g(a, run.purse.address)).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if back then auth while pending in method', async () => {
      const run = new Run()
      class A extends Jig {
        f () {
          this.satoshis = 1000
        }
      }
      class B extends Jig {
        g (a) {
          a.f()
          a.auth()
        }
      }
      const a = new A()
      const b = new B()
      await run.sync()
      expect(() => b.g(a)).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if auth, send, then auth in separate methods', async () => {
      const run = new Run()
      class A extends Jig {
        f (owner) {
          this.owner = owner
        }
      }
      class B extends Jig {
        g (a, owner) {
          a.auth()
          a.f(owner)
          a.auth()
        }
      }
      const a = new A()
      const b = new B()
      await run.sync()
      expect(() => b.g(a, run.purse.address)).to.throw('auth disabled: [jig A] has an unbound owner or satoshis value')
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('auths jig', async () => {
      const run = new Run()

      class A extends Jig { }
      const a = new A()
      await a.sync()

      function test (CA) {
        expect(CA.origin).not.to.equal(CA.location)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'auth', []]
          }
        ]
      })

      expect(a.auth()).to.equal(a)
      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('auths code in method', async () => {
      const run = new Run()

      class A extends Jig { f (B) { B.auth() } }
      class B { }
      const a = new A()
      const CB = run.deploy(B)
      await a.sync()
      await CB.sync()

      expectTx({
        nin: 2,
        nref: 1,
        nout: 2,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 1 }, 'f', [{ $jig: 0 }]]
          }
        ]
      })

      function test (B) {
        expect(B.location).not.to.equal(B.origin)
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

    it('throws if auth non-jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      expect(() => a.auth.apply({}, [])).to.throw('auth unavailable')
      expect(() => Jig.prototype.auth.apply(A, [])).to.throw('auth unavailable')
    })

    // ------------------------------------------------------------------------

    it('throws if undeployed', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { init () { this.auth() } }
      expect(() => new A()).to.throw('auth unavailable')
    })

    // ------------------------------------------------------------------------

    it('auth and send in same method', async () => {
      // auth is a request to happen on the owner at method start
      new Run() // eslint-disable-line
      class A extends Jig { f (owner) { this.auth(); this.owner = owner } }
      const a = new A()
      await a.sync()
      const owner = new PrivateKey().toPublicKey().toString()
      expect(() => a.f(owner)).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if destroy and auth in same method', async () => {
      // destroy is a request to happen after the method ends
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.destroy(); this.auth() } }
      const a = new A()
      await a.sync()
      expect(() => a.f()).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('auth twice in same method', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.auth(); this.auth() } }
      const a = new A()
      await a.sync()
      expect(() => a.f()).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('auth twice in same transaction', async () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      run.transaction(() => {
        CA.auth()
        CA.auth()
      })
      await run.sync()
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('can auth berry class', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'auth', []]
          }
        ]
      })
      CB.auth()
      await CB.sync()
      expect(CB.nonce).to.equal(2)
      const CB2 = await run.load(CB.location)
      expect(CB2.nonce).to.equal(2)
      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      expect(CB3.nonce).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('can auth berry class in jig method', async () => {
      const run = new Run()
      class B extends Berry { }
      class A extends Jig { static f (B) { B.auth() } }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      await run.sync()
      expectTx({
        nin: 2,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 1 }, 'f', [{ $jig: 0 }]]
          }
        ]
      })
      CA.f(CB)
      await CA.sync()
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('throws if auth undeployed berry class', async () => {
      const run = new Run()
      class B extends Berry { }
      const b = await B.load('abc')
      b.constructor.auth()
      await expect(run.sync()).to.be.rejectedWith('Invalid owner')
    })
  })
})

// ------------------------------------------------------------------------------------------------
