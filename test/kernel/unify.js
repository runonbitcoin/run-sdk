/**
 * unify.js
 *
 * Tests for unify and auto-unification
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { expectTx } = require('../env/misc')
const { Jig, Transaction } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Unify
// ------------------------------------------------------------------------------------------------

describe('Unify', () => {
  // --------------------------------------------------------------------------
  // autounify
  // --------------------------------------------------------------------------

  describe('autounify', () => {
    it('args with each other', async () => {
      const run = new Run()
      class A extends Jig { set (x) { this.x = x } }
      const a = new A()
      await a.sync()
      const a2 = await run.load(a.origin)
      a2.set(1)
      a2.constructor.auth()
      await a2.sync()
      const b = new A()
      await b.sync()

      expectTx({
        nin: 1,
        nref: 2,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'set', [{ $jig: 1 }, { $dup: ['2', '0'] }]]
          }
        ]
      })

      b.set(a, a2)

      function test (b) {
        expect(b.x[0]).to.equal(b.x[1])
      }

      await b.sync()
      test(b)

      const b2 = await run.load(b.location)
      test(b2)

      run.cache = new LocalCache()
      const b3 = await run.load(b.location)
      test(b3)
    })

    // ------------------------------------------------------------------------

    it('arg with jig property', async () => {
      const run = new Run()
      class A extends Jig { update () { this.n = 1 } }
      class B extends Jig {
        setX (x) { this.x = x }
        setY (y) { this.y = y }
      }

      function test (b) { expect(b.x.constructor).to.equal(b.y.constructor) }

      const a1 = new A()
      const b = new B()
      b.setX(a1)
      await a1.sync()
      const a2 = await run.load(a1.location)
      a2.update()
      await a2.sync()
      await b.sync()

      expectTx({
        nin: 1,
        nref: 2,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [{ $jig: 0 }, 'setY', [{ $jig: 1 }]]
          }
        ]
      })

      b.setY(a2)
      await b.sync()
      test(b)

      const b2 = await run.load(b.location)
      test(b2)

      run.cache = new LocalCache()
      const b3 = await run.load(b.location)
      test(b3)
    })

    // ------------------------------------------------------------------------

    it('arg with code property', async () => {
      const run = new Run()
      class A extends Jig { static set (n) { this.n = n } }
      const CA = run.deploy(A)
      await CA.sync()
      const CA2 = await run.load(CA.location)
      CA2.set(1)
      await CA2.sync()
      class B extends Jig { static set (Y) { this.Y = Y } }
      B.X = CA
      const CB = run.deploy(B)
      await CB.sync()

      function test (CB) { expect(CB.X).to.equal(CB.Y) }

      CB.set(CA2)
      await CB.sync()
      test(CB)

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('deps with args', async () => {
      const run = new Run()
      class B extends Jig { static g () { this.n = 2 } }
      B.n = 1
      const CB = run.deploy(B)
      class A extends Jig { static f () { this.n = B.n } }
      A.deps = { B }
      const CA = run.deploy(A)
      await CB.sync()
      const CB2 = await run.load(CB.location)
      CA.f()
      expect(CA.n).to.equal(1)
      CB2.g()
      CA.f(CB2)
      expect(CA.n).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('arg with inner upgraded code property', async () => {
      const run = new Run()
      function f () { return 1 }
      function g () { return 2 }
      const cg = run.deploy(f)
      cg.upgrade(g)
      await cg.sync()
      const cf = await run.load(cg.origin)
      class A extends Jig {
        init () { this.m = new Map() }
        setX (x) { this.m.set('x', x) }
        setY (y) { this.m.set('y', y) }
      }
      const a = new A()
      a.setX(cf)
      await a.sync()

      function test (a) { expect(a.m.get('x')).to.equal(a.m.get('y')) }

      a.setY(cg)
      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('jig args in constructor', async () => {
      const run = new Run()

      class A extends Jig {
        init (n) { this.n = 1 }
        f () { return this.n }
      }

      const CA = run.deploy(A)
      CA.auth()
      await CA.sync()

      const CO = await run.load(CA.origin)
      expect(CA.location).not.to.equal(CO.location)

      const a = new CA()
      const b = new CO()

      class C extends Jig { init (a, b) { this.n = a.f() + b.f() } }
      new C(a, b) // eslint-disable-line
    })

    // ------------------------------------------------------------------------

    it('jig calling method with updated class arg with newer method', async () => {
      const run = new Run()

      const A = run.deploy(class A extends Jig { set (b) { this.b = b } })
      const a = new A()
      await A.sync()

      const B = await run.load(A.location)
      B.upgrade(class B extends Jig { set (b) { this.b = b; this.bset = true } })
      const b = new B()

      function test (a) {
        expect(a.constructor.location).to.equal(a.b.constructor.location)
        expect(a.bset).to.equal(true)
      }

      a.set(b)
      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('code calling method with upgraded parent class in args', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      class A2 extends Jig { f () { this.n = 2 } }
      const CA = run.deploy(A)
      class B extends CA { }
      run.deploy(B)
      await run.sync()
      const CA2 = await run.load(CA.location)
      const b = new B()
      CA2.upgrade(A2)
      await run.sync()
      expect(Object.getPrototypeOf(b.constructor).name).to.equal('A')
      b.f(CA2)
      expect(Object.getPrototypeOf(b.constructor).name).to.equal('A2')
      expect(b.n).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('jig calling method with upgraded dep in args', async () => {
      const run = new Run()

      class B { static f () { return 1 } }
      class B2 { static f () { return 2 } }
      const CB = run.deploy(B)
      await run.sync()

      const CB2 = await run.load(CB.location)
      CB2.upgrade(B2)
      await run.sync()

      class A extends Jig { f () { return B.f() } }
      A.deps = { B: CB }

      const a = new A()
      expect(a.f()).to.equal(1)
      expect(a.f(CB2)).to.equal(2)
      expect(a.f()).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('throws when jig calling method with upgraded class arg and removed method', async () => {
      const run = new Run()

      const A = run.deploy(class A extends Jig { set (b) { this.b = b } })
      const a = new A()
      await A.sync()

      const B = await run.load(A.location)
      B.upgrade(class B extends Jig { set2 (b) { this.b = b } })
      const b = new B()

      function test (a) {
        expect(() => a.set(b)).to.throw('Cannot call set on [jig B]')
        expect(a.constructor).to.equal(b.constructor)
      }

      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('throws when code calling method with upgraded parent and removed method', async () => {
      const run = new Run()

      class P extends Jig { static set (b) { this.b = b } }
      class P2 extends Jig { }
      class A extends P { static set (b) { super.set(b) } }

      const CP = run.deploy(P)
      const CA = run.deploy(A)
      await run.sync()
      const CA2 = await run.load(CA.location)

      CP.upgrade(P2)
      await run.sync()

      CA2.set(1) // No error
      await run.sync()

      function test (CA) { expect(() => CA.set(CP)).to.throw() }
      test(CA2)

      const CA3 = await run.load(CA.location)
      test(CA3)

      run.cache = new LocalCache()
      const CA4 = await run.load(CA.location)
      test(CA4)
    })

    // ------------------------------------------------------------------------

    it('throws when jig instance calling method with upgraded parent class and removed method', async () => {
      const run = new Run()

      class P extends Jig { set (b) { this.b = b } }
      class P2 extends Jig { }
      class A extends P { set (b) { super.set(b) } }

      const a = new A()
      a.set(1) // No error

      await run.sync()

      const CP = await run.load(P.location)
      CP.upgrade(P2)

      function test (a) { expect(() => a.set({ CP })).to.throw() }
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('deploy props', async () => {
      const run = new Run()

      class A { }
      class B { }
      const CA = run.deploy(A)
      CA.upgrade(B)
      await run.sync()

      const CA2 = await run.load(CA.origin)
      class C { }
      C.CA1 = CA
      C.CA2 = CA2

      function test (C2) {
        expect(C2.CA1).to.equal(C2.CA2)
        expect(C2.CA1.location).not.to.equal(C2.CA2.origin)
      }

      const C2 = run.deploy(C)
      test(C2)
      await C2.sync()

      const C3 = await run.load(C2.location)
      test(C3)

      run.cache = new LocalCache()
      const C4 = await run.load(C2.location)
      test(C4)
    })

    // ------------------------------------------------------------------------

    it('upgrade props', async () => {
      const run = new Run()

      const X1 = run.deploy(class X extends Jig { })
      await X1.sync()
      const X2 = await run.load(X1.location)
      X2.auth()

      class A { }
      class B { }
      B.arr = [X1, X2]
      const CA = run.deploy(A)
      CA.upgrade(B)
      await run.sync()

      function test (C) {
        expect(C.arr[0]).to.equal(C.arr[1])
        expect(C.arr[0].location).not.to.equal(C.arr[1].origin)
      }

      test(CA)
      await CA.sync()

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })
  })

  // --------------------------------------------------------------------------
  // Time travel
  // --------------------------------------------------------------------------

  describe('Time travel', () => {
    it('throws if method time travel', async () => {
      const run = new Run()
      class A extends Jig { f () { return 1 } }
      class B extends Jig { f () { return 2 } }
      const CB = run.deploy(A).upgrade(B)
      await run.sync()
      const CA = await run.load(CB.origin)
      const a = new CA()
      expect(() => CB.prototype.f.apply(a)).to.throw('Method time travel')
    })
  })

  // --------------------------------------------------------------------------
  // Inconsistent transaction
  // --------------------------------------------------------------------------

  describe('Inconsistent transaction', () => {
    it('throws if create inconsistent jig classes', async () => {
      const run = new Run()

      const A2 = run.deploy(class A extends Jig { })
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)

      const tx = new Transaction()

      expect(() => tx.update(() => {
        new A1() // eslint-disable-line
        new A2() // eslint-disable-line
      })).to.throw('Inconsistent worldview')
    })

    // ------------------------------------------------------------------------

    it('throws if create inconsistent base jig classes', async () => {
      const run = new Run()

      const A2 = run.deploy(class A extends Jig { })
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)

      class B extends A1 { }
      class C extends A2 { }

      const tx = new Transaction()

      expect(() => tx.update(() => {
        new B() // eslint-disable-line
        new C() // eslint-disable-line
      })).to.throw('Inconsistent worldview')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy inconsistent props', async () => {
      const run = new Run()

      class A extends Jig { }
      const a2 = new A()
      a2.auth()
      await a2.sync()
      const a1 = await run.load(a2.origin)

      class B { }
      B.a = a1

      class C { }
      C.a = a2

      const tx = new Transaction()

      expect(() => tx.update(() => {
        run.deploy(B)
        run.deploy(C)
      })).to.throw('Inconsistent worldview')
    })

    // ------------------------------------------------------------------------

    it('throws if call methods with inconsistent args', async () => {
      const run = new Run()

      class A extends Jig { }
      A.sealed = false
      const A2 = run.deploy(A)
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)

      class B extends A1 { }
      class C extends Jig { }

      const tx = new Transaction()

      expect(() => tx.update(() => {
        new B() // eslint-disable-line
        new C(A2) // eslint-disable-line
      })).to.throw('Inconsistent worldview')
    })
  })

  // --------------------------------------------------------------------------
  // unify
  // --------------------------------------------------------------------------

  describe('unify', () => {
    it('unifies props', async () => {
      const run = new Run()
      const O2 = run.deploy(class O { })
      O2.destroy()
      await run.sync()
      const O1 = await run.load(O2.origin)
      class A extends Jig { static f () { this.name = this.O.name } }
      A.O = O1
      class B extends Jig { static f () { this.name = this.O.name } }
      B.O = O2
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(() => run.transaction(() => { CA.f(); CB.f() })).to.throw()
      Run.util.unify(CA, CB)
      run.transaction(() => { CA.f(); CB.f() })
    })

    // ------------------------------------------------------------------------

    it('unify class', async () => {
      const run = new Run()
      const A2 = run.deploy(class A extends Jig { f () { this.n = 1 } })
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)
      const a1 = new A1()
      const a2 = new A2()
      expect(() => run.transaction(() => { a1.f(); a2.f() })).to.throw()
      Run.util.unify(a1, a2)
      await run.transaction(() => { a1.f(); a2.f() })
    })

    // ------------------------------------------------------------------------

    it('unifies deps', async () => {
      const run = new Run()
      const A2 = run.deploy(class A { })
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)

      class B { static f () { return A.nonce } } // eslint-disable-line
      B.deps = { A: A1 }
      const CB = run.deploy(B)

      class C { static f () { return A.nonce } } // eslint-disable-line
      C.deps = { A: A2 }
      const CC = run.deploy(C)
      await run.sync()

      class D extends Jig { init (n) { this.n = n } }
      Run.util.unify(CB, CC)
      const d = run.transaction(() => new D(CB.f() + CC.f()))
      await d.sync()
      expect(d.n).to.equal(4)
    })

    // ------------------------------------------------------------------------

    it('throws if unify inconsistent top-level jigs', async () => {
      const run = new Run()
      const A2 = run.deploy(class A { })
      A2.destroy()
      await A2.sync()
      const A1 = await run.load(A2.origin)
      expect(() => Run.util.unify(A1, A2)).to.throw('Cannot unify inconsistent A')
    })
  })

  // --------------------------------------------------------------------------
  // Indirect references
  // --------------------------------------------------------------------------

  describe('Indirect references', () => {
    it('indirect refs must be loaded the same', async () => {
      const run = new Run()

      class A extends Jig { static f (C) { this.n = 1 } }
      class B { }
      class C { }
      A.B = B
      B.C = C

      const CA = run.deploy(A)
      run.deploy(B)
      const CC = run.deploy(C)
      await run.sync()

      const CC2 = await run.load(CC.location)
      CC2.auth()
      CA.f(CC2)
      await run.sync()

      run.cache = new LocalCache()
      const CA2 = await run.load(CA.location)
      expect(CA2.B.C.location).to.equal(CC2.origin)

      const CA3 = await run.load(CA.location)
      expect(CA3.B.C.location).to.equal(CC2.origin)
    })

    // ------------------------------------------------------------------------

    it('calculation from indirect refs must be the same', async () => {
      const run = new Run()

      class A extends Jig {
        static f (C) { this.n = 1 }
        static g () { return this.B.g() }
      }
      class B { static g () { return this.C.g() } }
      class C1 { static g () { return 1 } }
      class C2 { static g () { return 2 } }
      A.B = B
      B.C = C1

      const CA = run.deploy(A)
      run.deploy(B)
      const CC1 = run.deploy(C1)
      await run.sync()

      const CC2 = await run.load(CC1.location)
      CC2.upgrade(C2)
      CA.f(C2)
      await run.sync()

      run.cache = new LocalCache()
      const CA2 = await run.load(CA.location)
      expect(CA2.g()).to.equal(1)

      const CA3 = await run.load(CA.location)
      expect(CA3.g()).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('no non-determinism from indirect refs', async () => {
      const run = new Run()

      // ABC used to reproduce different inner ref states
      class A extends Jig { static f (C) { this.n = 1 } }
      class B { }
      class C { }
      A.B = B
      B.C = C
      const CA = run.deploy(A)
      await run.sync()

      // D will have a direct reference to that inner ref that is different
      class D extends Jig { static f (A) { this.n = 1 } }
      D.C = C
      const CD = run.deploy(D)
      await run.sync()

      // Destroy C, giving it two locations
      const C2 = await run.load(C.location)
      C2.destroy()
      await run.sync()

      // Now we have a way of getting to different inner ref states for CA
      // From cache, CA.B.C = C1 (origin)
      // From replay, CA.B.C = C2 (deleted)
      CA.f(C2)
      await run.sync()

      // Use this difference to update D. D afterward will have an updated state.
      CD.f(CA)
      await run.sync()

      // Load with and without the cache. The metadata should be the same.
      await run.load(CD.location)
      run.cache = new LocalCache()
      await run.load(CD.location)
    })

    // ------------------------------------------------------------------------

    it('no time travel from indirect refs', async () => {
      const run = new Run()

      // ABC used to reproduce different inner ref states
      class A extends Jig {
        static f (C) { this.n = 1 }
        static g (C) { this.n = 2 }
      }
      class B { }
      class C { }
      A.B = B
      B.C = C
      const C1 = run.deploy(C)
      const CA = run.deploy(A)
      await run.sync()

      // Destroy C, giving it two locations
      const C2 = await run.load(C.location)
      C2.destroy()
      await run.sync()

      // Now we have a way of getting to different inner ref states for CA
      // From cache, CA.B.C = C1 (origin)
      // From replay, CA.B.C = C2 (deleted)
      CA.f(C2)
      await run.sync()

      // Now load CA from cache and use it in a transaction where C1 is referenced
      const CA2 = await run.load(CA.location)
      CA2.g(C1)
      await CA2.sync()

      // Replay without cache. Make sure there is no time travel, that the
      // indirect newer ref is not counted as a reference that affects time.
      run.cache = new LocalCache()
      await run.load(CA2.location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
