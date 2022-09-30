/**
 * caller.js
 *
 * Tests for the caller special property
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Caller
// ------------------------------------------------------------------------------------------------

describe('Caller', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('null externally', async () => {
      const run = new Run()
      class A extends Jig {
        init () { this.initCaller = caller }
        f () { this.fCaller = caller }
      }
      const a = new A()
      a.f()
      function test (a) {
        expect(a.initCaller).to.equal(null)
        expect(a.fCaller).to.equal(null)
      }
      test(a)
      await a.sync()
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('called from another jig', async () => {
      const run = new Run()
      class Parent extends Jig {
        init () { this.child = new Child(this) }
        f () { this.self = this.child.f(this) }
      }
      class Child extends Jig {
        init () { this.initCaller = caller }
        f () { this.fCaller = caller }
      }
      Parent.deps = { Child }
      const parent = new Parent()
      parent.f()
      function test (parent) {
        expect(parent.child.initCaller).to.equal(parent)
        expect(parent.child.fCaller).to.equal(parent)
      }
      test(parent)
      await run.sync()
      const parent2 = await run.load(parent.location)
      test(parent2)
      run.cache = new LocalCache()
      const parent3 = await run.load(parent.location)
      test(parent3)
    })

    // ------------------------------------------------------------------------

    it('called in a hierarchy', async () => {
      const run = new Run()
      class A extends Jig { init () { B.f() } }
      class B extends Jig { static f () { this.c = new C() } }
      class C extends Jig { init () { this.initCaller = caller } }
      A.deps = { B }
      B.deps = { C }
      const CB = run.deploy(B)
      const a = new A()
      await a.sync()
      function test (B) { expect(B.c.initCaller).to.equal(B) }
      test(CB)
      const CB2 = await run.load(CB.location)
      test(CB2)
      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('caller is this', async () => {
      const run = new Run()
      class A extends Jig {
        init () { this.f() }
        f () { this.caller = caller }
      }
      const a = new A()
      await a.sync()
      function test (a) { expect(a.caller).to.equal(a) }
      test(a)
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('call method on caller', async () => {
      const run = new Run()
      class A extends Jig {
        set (n) { this.n = n }
        apply (b) { b.apply() }
      }
      class B extends Jig { apply () { caller.set(1) } }
      const a = new A()
      const b = new B()
      a.apply(b)
      function test (a) { expect(a.n).to.equal(1) }
      test(a)
      await run.sync()
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('local variable named caller', async () => {
      const run = new Run()
      class A extends Jig { init () { const caller = 2; this.n = caller } }
      const a = new A()
      await a.sync()
      function test (a) { expect(a.n).to.equal(2) }
      test(a)
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('dependency named caller', async () => {
      const run = new Run()
      function caller () { return 2 }
      class A extends Jig { static f () { this.n = caller() } }
      A.deps = { caller }
      const CA = run.deploy(A)
      CA.f()
      await CA.sync()
      function test (CA) { expect(CA.n).to.equal(2) }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if set caller', () => {
    new Run() // eslint-disable-line
    class A extends Jig { init () { caller = 1 } } // eslint-disable-line
      expect(() => new A()).to.throw('Cannot set caller')
    })

    // ------------------------------------------------------------------------

    it('caller is creator for a new jig', async () => {
      const run = new Run()
      class A extends Jig { init () { this.callerAtInit = caller } }
      class B extends Jig { f () { return new A() } }
      B.deps = { A }
      const b = new B()
      const a = b.f()
      await a.sync()
      expect(a.callerAtInit.location).to.equal(b.location)
      const a2 = await run.load(a.location)
      expect(a2.callerAtInit.location).to.equal(b.location)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      expect(a3.callerAtInit.location).to.equal(b.location)
    })
  })

  // --------------------------------------------------------------------------
  // Sidekick code
  // --------------------------------------------------------------------------

  describe('Sidekick code', () => {
    it('returns null externally', () => {
      const run = new Run()
      function f() { return caller } // eslint-disable-line
      const cf = run.deploy(f)
      expect(cf()).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('returns null for single calling jig', () => {
      const run = new Run()
      function f() { return caller } // eslint-disable-line
      class A extends Jig { static g () { return f() }}
      A.deps = { f }
      const CA = run.deploy(A)
      expect(CA.g()).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('returns calling jig when called from jig', () => {
      const run = new Run()
      function f() { return caller } // eslint-disable-line
      class A extends Jig { static g () { return f() }}
      A.deps = { f }
      class B extends Jig { static h () { return A.g() } }
      B.deps = { A }
      const CB = run.deploy(B)
      expect(CB.h()).to.equal(CB)
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('berry caller is null in pluck', async () => {
      const run = new Run()
      class B extends Berry {
        static async pluck () { return new B(caller) }
        init (c) { this.c = c }
      }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('abc')
      expect(b.c).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('berry caller is null in init', async () => {
      const run = new Run()
      class B extends Berry { init (c) { this.c = caller } }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('abc')
      expect(b.c).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('berry caller is same as sidekick code', async () => {
      const run = new Run()
      class B extends Berry { f() { return caller } } // eslint-disable-line
      run.deploy(B)
      await run.sync()
      const b = await B.load('abc')

      class A extends Jig { static g () { return b.f() }}
      A.deps = { b }
      const CA = run.deploy(A)
      expect(CA.g()).to.equal(null)

      class C extends Jig { static h () { return A.g() } }
      C.deps = { A }
      const CC = run.deploy(C)
      expect(CC.h()).to.equal(CC)
    })

    // ------------------------------------------------------------------------

    it('caller is null in berry load in pluck', async () => {
      const run = new Run()
      class A extends Berry {
        init () {
          this.caller = caller
        }
      }
      class B extends Berry {
        static async pluck () {
          const a = await A.load('')
          return new B(a)
        }

        init (a) { this.a = a }
      }
      B.deps = { A }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('')
      expect(b.a.caller).to.equal(null)
    })
  })
})

// ------------------------------------------------------------------------------------------------
