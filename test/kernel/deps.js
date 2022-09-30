/**
 * deps.js
 *
 * Tests for changing code deps dynamically
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const Run = require('../env/run')
const { Jig, Transaction } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Deps
// ------------------------------------------------------------------------------------------------

describe('Deps', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('set deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B } // eslint-disable-line
        static g () { B = 2 } // eslint-disable-line
        static h () { A.deps.B = 3 }
      }
      A.deps = { B: 1 }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.B).to.equal(2)
      expect(CA.nonce).to.equal(2)

      CA.h()
      expect(CA.f()).to.equal(3)
      expect(CA.deps.B).to.equal(3)
      await CA.sync()
      expect(CA.nonce).to.equal(3)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(3)
      expect(CA2.deps.B).to.equal(3)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(3)
      expect(CA3.deps.B).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('throws if set deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: 1 }
      const CA = run.deploy(A)
      expect(() => { CA.deps.B = 1 }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('set inner deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B.n } // eslint-disable-line
        static g () { B.n = 2 } // eslint-disable-line
        static h () { A.deps.B.n = 3 }
      }
      A.deps = { B: { n: 1 } }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.B.n).to.equal(2)
      expect(CA.nonce).to.equal(2)

      CA.h()
      expect(CA.f()).to.equal(3)
      expect(CA.deps.B.n).to.equal(3)
      await CA.sync()
      expect(CA.nonce).to.equal(3)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(3)
      expect(CA2.deps.B.n).to.equal(3)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(3)
      expect(CA3.deps.B.n).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('set inner intrinsic deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B.get(1) } // eslint-disable-line
        static g () { A.deps.B.set(1, 2) }
      }
      A.deps = { B: new Map() }

      const CA = run.deploy(A)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.B.get(1)).to.equal(2)
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(2)
      expect(CA2.deps.B.get(1)).to.equal(2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(2)
      expect(CA3.deps.B.get(1)).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('throws if set inner deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: [0] }
      const CA = run.deploy(A)
      expect(() => { CA.deps.B[0] = 1 }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('add deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B } // eslint-disable-line
        static g () { A.deps.B = 1 }
      }

      const CA = run.deploy(A)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(1)
      expect(CA.deps.B).to.equal(1)
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(1)
      expect(CA2.deps.B).to.equal(1)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(1)
      expect(CA3.deps.B).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('throws if add deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      expect(() => { CA.deps.B = 1 }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('throws if add inner deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: { } }
      const CA = run.deploy(A)
      expect(() => { CA.deps.B.n = 1 }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('delete deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return typeof B !== 'undefined' ? B : undefined } // eslint-disable-line
        static g () { delete A.deps.B } // eslint-disable-line
      }
      A.deps = { B: 1 }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(undefined)
      expect(typeof CA.deps.B).to.equal('undefined')
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(undefined)
      expect(typeof CA2.deps.B).to.equal('undefined')

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(undefined)
      expect(typeof CA3.deps.B).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('throws if delete deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: { } }
      const CA = run.deploy(A)
      expect(() => { delete CA.deps.B }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('delete inner deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B.n } // eslint-disable-line
        static g () { delete A.deps.B.n } // eslint-disable-line
      }
      A.deps = { B: { n: 1 } }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(undefined)
      expect(typeof CA.deps.B.n).to.equal('undefined')
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(undefined)
      expect(typeof CA2.deps.B.n).to.equal('undefined')

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(undefined)
      expect(typeof CA3.deps.B.n).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('throws if delete inner deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: { n: 1 } }
      class B extends A { static f () { delete A.deps.B.n } }
      const CB = run.deploy(B)
      expect(() => CB.f()).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('define deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B } // eslint-disable-line
        static g () { Object.defineProperty(A.deps, 'B', { configurable: true, enumerable: true, writable: true, value: 2 }) }
      }
      A.deps = { B: 1 }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.B).to.equal(2)
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(2)
      expect(CA2.deps.B).to.equal(2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(2)
      expect(CA3.deps.B).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('throws if define deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
      expect(() => Object.defineProperty(CA.deps, 'B', desc)).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('define inner deps from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B[0] } // eslint-disable-line
        static g () { Object.defineProperty(A.deps.B, '0', { configurable: true, enumerable: true, writable: true, value: 2 }) }
      }
      A.deps = { B: [1] }

      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      await CA.sync()
      expect(CA.nonce).to.equal(1)

      CA.g()
      await CA.sync()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.B[0]).to.equal(2)
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(2)
      expect(CA2.deps.B[0]).to.equal(2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(2)
      expect(CA3.deps.B[0]).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('throws if define inner deps from outside', () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { B: { } }
      const CA = run.deploy(A)
      const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
      expect(() => Object.defineProperty(CA.deps.B, 'n', desc)).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('set caller dep', async () => {
      const run = new Run()
      class A extends Jig {
        static f() { return caller } // eslint-disable-line
        static g () { A.deps.caller = 1 }
        static h () { caller = 2 } // eslint-disable-line
      }
      const CA = run.deploy(A)
      expect(CA.f()).to.equal(null)
      expect(typeof CA.deps.caller).to.equal('undefined')

      CA.g()
      expect(CA.f()).to.equal(1)
      expect(CA.deps.caller).to.equal(1)
      await run.sync()
      expect(CA.nonce).to.equal(2)

      CA.h()
      expect(CA.f()).to.equal(2)
      expect(CA.deps.caller).to.equal(2)
      await run.sync()
      expect(CA.nonce).to.equal(3)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(2)
      expect(CA2.deps.caller).to.equal(2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(2)
      expect(CA3.deps.caller).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('delete caller dep', async () => {
      const run = new Run()
      class A extends Jig {
        static f() { return caller } // eslint-disable-line
        static g () { delete A.deps.caller }
      }
      A.deps = { caller: 1 }
      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      expect(CA.deps.caller).to.equal(1)

      CA.g()
      expect(CA.f()).to.equal(null)
      expect(typeof CA.deps.caller).to.equal('undefined')
      await run.sync()
      expect(CA.nonce).to.equal(2)

      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(null)
      expect(typeof CA2.deps.caller).to.equal('undefined')

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(null)
      expect(typeof CA3.deps.caller).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('private deps available from inside', async () => {
      const run = new Run()
      class A extends Jig {
        static f() { return _B } // eslint-disable-line
        static g() { return this.deps._B } // eslint-disable-line
        static h() { _B = 2 } // eslint-disable-line
      }
      A.deps = { _B: 1 }
      const CA = run.deploy(A)
      expect(CA.f()).to.equal(1)
      expect(CA.g()).to.equal(1)
      CA.h()
      expect(CA.f()).to.equal(2)
      await run.sync()
      const CA2 = await run.load(CA.location)
      expect(CA2.f()).to.equal(2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      expect(CA3.f()).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('private deps available from outside', async () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { _B: 1 }
      const CA = run.deploy(A)
      expect(CA.deps._B).to.equal(1)
      await run.sync()
      run.cache = new LocalCache()
      const CA2 = await run.load(CA.location)
      expect(CA2.deps._B).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('private deps unavailable from another jig', async () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { _B: 1 }
      class B extends A { static f (A) { return A.deps._B } }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(() => CB.f(CA)).to.throw('Cannot get private property _B')
      await run.sync()
      run.cache = new LocalCache()
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      expect(() => CB2.f(CA2)).to.throw('Cannot get private property _B')
    })

    // ------------------------------------------------------------------------

    it('throws if delete deps object', () => {
      const run = new Run()
      class A extends Jig { static f () { delete this.deps } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('Cannot delete deps')
    })

    // ------------------------------------------------------------------------

    it('throws if set deps object', () => {
      const run = new Run()
      class A extends Jig { static f () { this.deps = {} } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('Cannot set deps')
    })

    // ------------------------------------------------------------------------

    it('throws if define deps object', () => {
      const run = new Run()
      class A extends Jig {
        static f () {
          Object.defineProperty(this, 'deps', { configurable: true, enumerable: true, writable: true, value: 2 })
        }
      }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('Cannot define deps')
    })

    // ------------------------------------------------------------------------

    it('throws if set prototype of deps object', () => {
      const run = new Run()
      class A extends Jig { static f () { Object.setPrototypeOf(A.deps, {}) } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('setPrototypeOf disabled')
    })

    // ------------------------------------------------------------------------

    it('throws if define getter deps', () => {
      const run = new Run()
      class A extends Jig {
        static g () { Object.defineProperty(A.deps, 'B', { configurable: true, enumerable: true, get: () => 2 }) }
      }
      const CA = run.deploy(A)
      expect(() => CA.g()).to.throw('Descriptor must have a value')
    })

    // ------------------------------------------------------------------------

    it('throws if define non-configurable deps', () => {
      const run = new Run()
      class A extends Jig {
        static g () { Object.defineProperty(A.deps, 'B', { configurable: false, enumerable: true, writable: true, value: 2 }) }
      }
      const CA = run.deploy(A)
      expect(() => CA.g()).to.throw('Descriptor must be configurable')
    })

    // ------------------------------------------------------------------------

    it('set deps after rollback', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { return B } // eslint-disable-line
        static inc () { B += 1 } // eslint-disable-line
      }
      A.deps = { B: 1 }
      const CA = run.deploy(A)
      await CA.sync()
      stub(run.blockchain, 'broadcast').throwsException()
      CA.inc()
      await expect(CA.sync()).to.be.rejected
      expect(CA.nonce).to.equal(1)
      expect(CA.f()).to.equal(1)
      run.blockchain.broadcast.reset()
      run.blockchain.broadcast.callThrough()
      CA.inc()
      await CA.sync()
      expect(CA.f()).to.equal(2)
    })
  })

  // --------------------------------------------------------------------------
  // Sidekick code
  // --------------------------------------------------------------------------

  describe('Sidekick code', () => {
    it('deps cannot be changed', () => {
      const run = new Run()
      class A { static f () { A.deps.n = 1 } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('Cannot set n: immutable')
    })
  })

  // --------------------------------------------------------------------------
  // Transaction
  // --------------------------------------------------------------------------

  describe('Transaction', () => {
    it('multiple updates in transaction', async () => {
      const run = new Run()
      class A extends Jig {
        static f () { this.deps.n = 1 }
        static g() { A.deps.m = n + 2 } // eslint-disable-line
        static h () { A.deps.o = A.deps.m + 3 }
        static i () { return o } // eslint-disable-line
      }
      const CA = run.deploy(A)
      const tx = new Transaction()
      tx.update(() => CA.f())
      tx.update(() => CA.g())
      tx.update(() => CA.h())
      await tx.publish()
      expect(CA.i()).to.equal(6)
      const CA2 = await run.load(CA.location)
      expect(CA2.deps.o).to.equal(6)
    })
  })

  // --------------------------------------------------------------------------
  // Sync code
  // --------------------------------------------------------------------------

  describe('Sync', () => {
    it('jig code', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      class B extends Jig { static g() { return A.n } } // eslint-disable-line
      B.deps = { A }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CB.g()).to.equal(undefined)
      await run.sync()
      const CA2 = await run.load(CA.location)
      CA2.f()
      await CA2.sync()
      expect(CB.g()).to.equal(undefined)
      await CB.sync()
      expect(CB.g()).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('sidekick code', async () => {
      const run = new Run()
      class A { static bnonce () { return B.nonce }}
      class B { }
      A.deps = { B }
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      await run.sync()
      expect(CA.bnonce()).to.equal(1)
      const CB2 = await run.load(CB.location)
      CB2.destroy()
      await CB2.sync()
      await CA.sync()
      expect(CA.bnonce()).to.equal(2)
    })
  })

  // --------------------------------------------------------------------------
  // Unify
  // --------------------------------------------------------------------------

  describe('Unify', () => {
    it('jig code deps with args', async () => {
      const run = new Run()
      class A extends Jig { static g () { this.n = 1 } }
      class B extends Jig { static f () { return A.n } } // eslint-disable-line
      B.deps = { A }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CB.f([CA])).to.equal(undefined)
      await run.sync()
      const CA2 = await run.load(CA.location)
      CA2.g()
      expect(CB.f([CA2])).to.equal(1)
      await run.sync()
      await run.load(CB.location)
    })

    // ------------------------------------------------------------------------

    it('sidekick code deps with upgraded caller', async () => {
      const run = new Run()
      class A { static f () { return B.n } } // eslint-disable-line
      class B1 { }
      B1.n = 1
      class B2 { }
      B2.n = 2
      A.deps = { B: B1 }
      const CA = run.deploy(A)
      const CB1 = run.deploy(B1)
      await run.sync()
      const CB2 = await run.load(CB1.origin)
      CB2.upgrade(B2)
      await run.sync()
      class D extends Jig { init () { this.n = A.f() } }
      D.deps = { A: CA, B: CB2 }
      const d = new D()
      expect(d.n).to.equal(2)
      await run.sync()
      run.cache = new LocalCache()
      await run.load(d.location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
