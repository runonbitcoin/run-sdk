/**
 * interactive.js
 *
 * Tests for the interactive code property
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { createTestExtrasRun } = require('../env/misc')
const { Jig, Berry, Code } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Interactive
// ------------------------------------------------------------------------------------------------

describe('Interactive', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Deploy
  // --------------------------------------------------------------------------
  describe('Deploy', () => {
    it('interactive by default', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.B = B } }
      class B { }
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      CA.f(CB)
      await run.sync()
      await run.load(CA.location)
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('interactive set to true', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.B = B } }
      class B { }
      A.interactive = true
      B.interactive = true
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      CA.f(CB)
      await run.sync()
      await run.load(CA.location)
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('non-interactive', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.x = B.name } }
      class B { }
      A.interactive = false
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      await run.sync()
      expect(() => CA.f(CB)).to.throw('A is not permitted to interact with B')
    })
  })

  // --------------------------------------------------------------------------
  // Upgrade
  // --------------------------------------------------------------------------

  describe('Upgrade', () => {
    it('become interactive', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.x = B.name } }
      class B { }
      A.interactive = false
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      await run.sync()
      expect(() => CA.f(CB)).to.throw('A is not permitted to interact with B')
      class A2 extends Jig { static f (B) { this.x = B.name } }
      A2.interactive = true
      CA.upgrade(A2)
      CA.f(B)
      await CA.sync()
      expect(CA.x).to.equal('B')
    })

    // ------------------------------------------------------------------------

    it('become interactive in same transaction', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.x = B.name } }
      class B { }
      A.interactive = false
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      await run.sync()
      expect(() => CA.f(CB)).to.throw('A is not permitted to interact with B')
      class A2 extends Jig { static f (B) { this.x = B.name } }
      A2.interactive = true
      run.transaction(() => {
        CA.upgrade(A2)
        CA.f(B)
      })
      await CA.sync()
      expect(CA.x).to.equal('B')
    })

    // ------------------------------------------------------------------------

    it('become non-interactive', async () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { this.x = x.name }
        static g () { this.interactive = false }
      }
      function h () { }
      function i () { }
      const ch = run.deploy(h)
      const ci = run.deploy(i)
      const CA = run.deploy(A)
      await run.sync()
      CA.f(ch)
      CA.g()
      expect(() => CA.f(ci)).to.throw('A is not permitted to interact with i')
    })
  })

  // --------------------------------------------------------------------------
  // Method
  // --------------------------------------------------------------------------

  describe('Method', () => {
    it('set to interactive', async () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { this.x = x.name }
        static g () { this.interactive = true }
      }
      A.interactive = false
      function h () { }
      const ch = run.deploy(h)
      const CA = run.deploy(A)
      expect(() => CA.f(ch)).to.throw('A is not permitted to interact with h')
      CA.g()
      CA.f(ch)
      function test (CA) { expect(CA.x).to.equal('h') }
      test(CA)
      await run.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('define non-interactive', async () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { this.x = x.name }
        static g () { Object.defineProperty(this, 'interactive', { value: false, configurable: true, enumerable: true, writable: true }) }
      }
      function h () { }
      const ch = run.deploy(h)
      const CA = run.deploy(A)
      await run.sync()
      CA.g()
      expect(() => CA.f(ch)).to.throw('A is not permitted to interact with h')
    })

    // ------------------------------------------------------------------------

    it('delete to become interactive', async () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { this.x = x.name }
        static g () { this.interactive = false }
        static h () { delete this.interactive }
      }
      class B extends A { }
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      CA.g()
      expect(() => CA.f(CB)).to.throw('A is not permitted to interact with B')
      CA.h()
      CA.f(CB)
      function test (CA) { expect(CA.x).to.equal('B') }
      test(CA)
      await run.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })
  })

  // --------------------------------------------------------------------------
  // Non-interactivity
  // --------------------------------------------------------------------------

  describe('Non-interactivity', () => {
    it('pass self as parameter', async () => {
      const run = new Run()
      class A extends Jig { static f (x) { this.x = x.name } }
      A.interactive = false
      const CA = run.deploy(A)
      CA.f(CA)
      function test (CA) { expect(CA.x).to.equal('A') }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('pass instance as parameter', async () => {
      const run = new Run()
      class A extends Jig { static f (x) { this.x = x.constructor.name } }
      A.interactive = false
      const CA = run.deploy(A)
      const a = new CA()
      CA.f(a)
      function test (CA) { expect(CA.x).to.equal('A') }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('pass base class as parameter', async () => {
      const run = new Run()
      class B extends Jig { }
      class A extends B { static f (x) { this.x = x.name } }
      A.interactive = false
      const CA = run.deploy(A)
      CA.f(CA.deps.B)
      function test (CA) { expect(CA.x).to.equal('B') }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('pass dependency as parameter', async () => {
      const run = new Run()
      class B extends Jig { }
      run.deploy(B)
      class A extends Jig { static f (x) { this.x = x.name } }
      A.interactive = false
      A.deps = { B }
      const CA = run.deploy(A)
      CA.f(CA.deps.B)
      function test (CA) { expect(CA.x).to.equal('B') }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('pass dependency instance as parameter', async () => {
      const run = new Run()
      class B extends Jig { }
      const b = new B()
      class A extends Jig { static f (x) { this.x = x.constructor.name } }
      A.interactive = false
      A.deps = { B }
      const CA = run.deploy(A)
      CA.f(b)
      function test (CA) { expect(CA.x).to.equal('B') }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('pass native dependency as parameter', async () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { this.x = x.name }
        static g (y) { this.y = y.name }
      }
      A.interactive = false
      A.deps = { Code }
      const CA = run.deploy(A)
      CA.f(Jig)
      CA.g(Code)
      function test (CA) {
        expect(CA.x).to.equal('Jig')
        expect(CA.y).to.equal('Code')
      }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('atomically use two instances', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      A.interactive = false
      const a1 = new A()
      const a2 = new A()
      run.transaction(() => {
        a1.f()
        a2.f()
      })
      await run.sync()
      await run.load(a2.location)
      run.cache = new LocalCache()
      await run.load(a2.location)
    })

    // ------------------------------------------------------------------------

    it('atomically use a class and an instance', async () => {
      const run = new Run()
      class A extends Jig {
        f () { this.n = 1 }
        static g () { this.m = 1 }
      }
      A.interactive = false
      const a = new A()
      run.transaction(() => {
        a.f()
        a.constructor.g()
      })
      await run.sync()
      await run.load(a.location)
      run.cache = new LocalCache()
      await run.load(a.location)
    })
  })

  // --------------------------------------------------------------------------
  // Use cases
  // --------------------------------------------------------------------------

  describe('Use cases', () => {
    it('mint non-interactive tokens', async () => {
      const run = await createTestExtrasRun()
      class A extends Run.extra.test.Token { }
      A.interactive = false
      const CA = run.deploy(A)
      const a = CA.mint(100)
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('combine non-interactive tokens', async () => {
      const run = await createTestExtrasRun()
      class A extends Run.extra.test.Token { }
      A.interactive = false
      const CA = run.deploy(A)
      const a = CA.mint(100)
      const b = CA.mint(100)
      a.combine(b)
      expect(a.amount).to.equal(200)
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if use different two tokens that are non-interactive', async () => {
      const run = await createTestExtrasRun()
      class A extends Run.extra.test.Token { }
      A.interactive = false
      class B extends Run.extra.test.Token { }
      B.interactive = false
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      const a = CA.mint(100)
      const b = CB.mint(100)
      await run.sync()
      expect(() => run.transaction(() => {
        a.send(run.purse.address)
        b.send(run.purse.address, 50)
      })).to.throw('B is not permitted to interact with A')
    })

    // ------------------------------------------------------------------------

    it('throws if send from non-interactive jig', async () => {
      const run = await createTestExtrasRun()
      class A extends Run.extra.test.Token { }
      A.interactive = false
      class B extends Jig { static f (a, owner) { a.send(owner) } }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      const a = CA.mint(100)
      await run.sync()
      expect(() => CB.f(a, run.purse.address)).to.throw('A is not permitted to interact with B')
    })
  })

  // --------------------------------------------------------------------------
  // Misc
  // --------------------------------------------------------------------------

  describe('Misc', () => {
    it('jigs cannot set interactive property', () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.interactive = true } }
      const a = new A()
      expect(() => a.f()).to.throw('Cannot set interactive: reserved')
    })

    // ------------------------------------------------------------------------

    it('berries cannot set interactive property', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.interactive = true } }
      await expect(B.load('')).to.be.rejectedWith('Cannot set interactive: reserved')
    })

    // ------------------------------------------------------------------------

    it('code can set interactive property on sub-object', async () => {
      const run = new Run()
      class A extends Jig { }
      A.x = { interactive: [] }
      const CA = run.deploy(A)
      await CA.sync()
      await run.load(CA.location)
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('jigs can set interactive property on sub-object', async () => {
      const run = new Run()
      class A extends Jig { init () { this.x = { interactive: null } } }
      const a = new A()
      await run.sync()
      await run.load(a.location)
      run.cache = new LocalCache()
      await run.load(a.location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
