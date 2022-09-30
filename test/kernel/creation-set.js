/**
 * creation-set.js
 *
 * Tests for lib/kernel/creation-set.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry } = Run
const unmangle = require('../env/unmangle')
const CreationSet = unmangle(unmangle(Run)._CreationSet)

// ------------------------------------------------------------------------------------------------
// CreationSet
// ------------------------------------------------------------------------------------------------

describe('CreationSet', () => {
  // --------------------------------------------------------------------------
  // _add
  // --------------------------------------------------------------------------

  describe('_add', () => {
    it('adds jigs once', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const a2 = await run.load(a.location)
      const b = new A()
      const s = unmangle(new CreationSet())
      s._add(a)
      s._add(a)
      s._add(a2)
      s._add(b)
      expect(s._size).to.equal(2)
      expect(s._arr()).to.deep.equal([a, b])
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent worldview', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      a.auth()
      await a.sync()
      const a2 = await run.load(a.origin)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(() => s._add(a2)).to.throw('Inconsistent worldview')
    })

    // ------------------------------------------------------------------------

    it('throws if not a creation', () => {
      const s = unmangle(new CreationSet())
      expect(() => s._add(null)).to.throw()
      expect(() => s._add('abc')).to.throw()
      expect(() => s._add([])).to.throw()
      expect(() => s._add(() => {})).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // _delete
  // --------------------------------------------------------------------------

  describe('_delete', () => {
    it('removes same jigs', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const a2 = await run.load(a.location)
      const b = new A()
      const s = unmangle(new CreationSet())
      s._add(a)
      s._add(b)
      s._delete(a2)
      s._delete(b)
      expect(s._size).to.equal(0)
      expect(s._arr()).to.deep.equal([])
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent worldview', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      a.auth()
      await a.sync()
      const a2 = await run.load(a.origin)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(() => s._delete(a2)).to.throw('Inconsistent worldview')
    })
  })

  // --------------------------------------------------------------------------
  // _has
  // --------------------------------------------------------------------------

  describe('_has', () => {
    it('returns true for same jigs added', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const a2 = await run.load(a.location)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(s._has(a)).to.equal(true)
      expect(s._has(a2)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false for jigs not added', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const b = new A()
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(s._has(b)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for invalid values', () => {
      const s = unmangle(new CreationSet())
      expect(s._has({})).to.equal(false)
      expect(s._has(null)).to.equal(false)
      expect(s._has(x => x)).to.equal(false)
      expect(s._has(1)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent worldview', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      a.auth()
      await a.sync()
      const a2 = await run.load(a.origin)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(() => s._has(a2)).to.throw('Inconsistent worldview')
    })
  })

  // --------------------------------------------------------------------------
  // _get
  // --------------------------------------------------------------------------

  describe('_get', () => {
    it('returns same jig if added', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(s._get(a)).to.equal(a)
    })

    // ------------------------------------------------------------------------

    it('returns original jig added if same', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const a2 = await run.load(a.location)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(s._get(a2)).to.equal(a)
    })

    // ------------------------------------------------------------------------

    it('returns undefined if not added', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const s = unmangle(new CreationSet())
      expect(s._get(a)).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('returns undefined for invalid values', () => {
      const s = unmangle(new CreationSet())
      expect(s._get({})).to.equal(undefined)
      expect(s._get(null)).to.equal(undefined)
      expect(s._get(x => x)).to.equal(undefined)
      expect(s._get(1)).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent worldview', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      a.auth()
      await a.sync()
      const a2 = await run.load(a.origin)
      const s = unmangle(new CreationSet())
      s._add(a)
      expect(() => s._get(a2)).to.throw('Inconsistent worldview')
    })
  })

  // --------------------------------------------------------------------------
  // _sameCreation
  // --------------------------------------------------------------------------

  describe('_sameCreation', () => {
    it('true if same', () => {
      const run = new Run()
      const A = run.deploy(class A { })
      expect(CreationSet._sameCreation(A, A)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('true if different instances of same jig', async () => {
      const run = new Run()
      const A = run.deploy(class A { })
      await A.sync()
      const A2 = await run.load(A.location)
      expect(CreationSet._sameCreation(A, A2)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('throws if different jigs', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      class B extends Jig { }
      const a = new A()
      const a2 = new A()
      const b = new B()
      expect(CreationSet._sameCreation(a, a2)).to.equal(false)
      expect(CreationSet._sameCreation(a, b)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('throws if different locations', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      a.auth()
      await a.sync()
      const a2 = await run.load(a.origin)
      expect(() => CreationSet._sameCreation(a, a2)).to.throw('Inconsistent worldview')
    })

    // ------------------------------------------------------------------------

    it('false if non-creation', () => {
      expect(CreationSet._sameCreation({}, {})).to.equal(false)
      expect(CreationSet._sameCreation(null, null)).to.equal(false)
      class A { }
      expect(CreationSet._sameCreation(A, A)).to.equal(false)
      const run = new Run()
      const A2 = run.deploy(A)
      expect(CreationSet._sameCreation(A2, {})).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if undeployed', () => {
      const run = new Run()
      const A = Run.util.install(class A { })
      const B = run.deploy(class B { })
      expect(CreationSet._sameCreation(A, B)).to.equal(false)
      expect(CreationSet._sameCreation(B, A)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns true for same berries', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('abc')
      const b2 = await CB.load('abc')
      expect(CreationSet._sameCreation(b, b2)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('return false for different berries', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()

      const b = await CB.load('abc')
      const b2 = await CB.load('def')
      expect(CreationSet._sameCreation(b, b2)).to.equal(false)

      class C extends Berry { }
      const CC = run.deploy(C)
      await CC.sync()

      const c = await C.load('abc')
      expect(CreationSet._sameCreation(b, c)).to.equal(false)

      const b3 = { location: `${CB.location}_abc` }
      Object.setPrototypeOf(b3, CB.prototype)
      expect(CreationSet._sameCreation(b, b3)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for undeployed berries', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { }
      const b = await B.load('abc')
      const b2 = await B.load('abc')
      expect(CreationSet._sameCreation(b, b2)).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
