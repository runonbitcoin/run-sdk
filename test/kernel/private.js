/**
 * private.js
 *
 * Tests for private properties and methods on jigs
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Private
// ------------------------------------------------------------------------------------------------

describe('Private', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    // ------------------------------------------------------------------------
    // has
    // ------------------------------------------------------------------------

    describe('has', () => {
      it('available internally', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          has () { return '_x' in this }
        }
        function test (a) { expect(a.has()).to.equal(true) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('can read externally', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        function test (a) { expect('_x' in a).to.equal(true) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('throws from another jig of different class', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        class B extends Jig { has (a) { return '_x' in a }}
        function test (a, b) { expect(() => b.has(a)).to.throw('Cannot check private property _x') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('throws from another jig of child class', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        class B extends A { has (a) { return '_x' in a }}
        function test (a, b) { expect(() => b.has(a)).to.throw('Cannot check private property _x') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('available from another jig of same class', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          has (a) { return '_x' in a }
        }
        function test (a, b) { expect(b.has(a)).to.equal(true) }
        const a = new A()
        const b = new A()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })
    })

    // ------------------------------------------------------------------------
    // get
    // ------------------------------------------------------------------------

    describe('get', () => {
      it('available internally', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          get () { return this._x }
        }
        function test (a) { expect(a.get()).to.equal(1) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('available externally', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        function test (a) { expect(a._x).to.equal(1) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('throws from another jig of different class', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        class B extends Jig { get (a) { return a._x }}
        function test (a, b) { expect(() => b.get(a)).to.throw('Cannot get private property _x') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('throws from another jig of parent class', async () => {
        const run = new Run()
        class B extends Jig { get (a) { return a._x }}
        class A extends B { init () { this._x = 1 } }
        function test (a, b) { expect(() => b.get(a)).to.throw('Cannot get private property _x') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('available from another jig of same class', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          get (a) { return a._x }
        }
        function test (a, b) { expect(b.get(a)).to.equal(1) }
        const a = new A()
        const b = new A()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('throws if read in pending', async () => {
        const run = new Run()
        class A extends Jig { init () { this.o = { _x: 1 } } }
        class B extends Jig { f (a) { this.y = [a.o]; return this.y[0]._x } }
        const a = new A()
        const b = new B()
        function test (a, b) { expect(() => b.f(a)).to.throw('Cannot get private property _x') }
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })
    })

    // ------------------------------------------------------------------------
    // getOwnPropertyDescriptor
    // ------------------------------------------------------------------------

    describe('getOwnPropertyDescriptor', () => {
      it('available internally', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          get () { return Object.getOwnPropertyDescriptor(this, '_x').value }
        }
        function test (a) { expect(a.get()).to.equal(1) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('available externally', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        function test (a) {
          expect(Object.getOwnPropertyDescriptor(a, '_x').value).to.equal(1)
        }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('throws from another jig of different class', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        class B extends Jig { get (a) { return Object.getOwnPropertyDescriptor(a, '_x').value }}
        function test (a, b) { expect(() => b.get(a)).to.throw('Cannot get descriptor for private property _x') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('available from another jig of same class', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          get (a) { return Object.getOwnPropertyDescriptor(a, '_x').value }
        }
        function test (a, b) { expect(b.get(a)).to.equal(1) }
        const a = new A()
        const b = new A()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })
    })

    // ------------------------------------------------------------------------
    // ownKeys
    // ------------------------------------------------------------------------

    describe('ownKeys', () => {
      it('includes all internally', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          includes () { return Reflect.ownKeys(this).includes('_x') }
        }
        function test (a) { expect(a.includes()).to.equal(true) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('includes all externally', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        function test (a) { expect(Reflect.ownKeys(a).includes('_x')).to.equal(true) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('filters from another jig of different class', async () => {
        const run = new Run()
        class A extends Jig { init () { this._x = 1 } }
        class B extends Jig { includes (a) { return Reflect.ownKeys(a).includes('_x') } }
        function test (a, b) { expect(b.includes(a)).to.equal(false) }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('includes from another jig of same class', async () => {
        const run = new Run()
        class A extends Jig {
          init () { this._x = 1 }
          includes (a) { return Reflect.ownKeys(a).includes('_x') }
        }
        function test (a, b) { expect(b.includes(a)).to.equal(true) }
        const a = new A()
        const b = new A()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })
    })

    // ------------------------------------------------------------------------
    // set
    // ------------------------------------------------------------------------

    describe('set', () => {
      it('does not clone foreign private properties', async () => {
        const run = new Run()
        class A extends Jig { init () { this.o = { _n: 1, p: { _m: [] } } } }
        class B extends Jig { f (a) { this.o = a.o } }
        const a = new A()
        const b = new B()
        b.f(a)
        function test (b) {
          expect('_n' in b.o).to.equal(false)
          expect('_m' in b.o.p).to.equal(false)
        }
        await run.sync()
        const b2 = await run.load(b.location)
        test(b2)
        run.cache = new LocalCache()
        const b3 = await run.load(b.location)
        test(b3)
      })

      // ----------------------------------------------------------------------

      it('does not clone foreign pending private properties', async () => {
        const run = new Run()
        class A extends Jig { init () { this.o = { _n: 1, p: { _m: [] } } } }
        class B extends Jig { f (a) { this.z = { o: a.o } } }
        const a = new A()
        const b = new B()
        b.f(a)
        function test (b) {
          expect('_n' in b.z.o).to.equal(false)
          expect('_m' in b.z.o.p).to.equal(false)
        }
        await run.sync()
        const b2 = await run.load(b.location)
        test(b2)
        run.cache = new LocalCache()
        const b3 = await run.load(b.location)
        test(b3)
      })
    })

    // ------------------------------------------------------------------------
    // Method
    // ------------------------------------------------------------------------

    describe('Method', () => {
      it('available internally', async () => {
        const run = new Run()
        class A extends Jig {
          f () { return this._g() }
          _g () { return 1 }
        }
        function test (a) { expect(a.f()).to.equal(1) }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('throws if call externally', async () => {
        const run = new Run()
        class A extends Jig { _f () { return 1 } }
        function test (a) {
          expect(typeof a._f).to.equal('function')
          expect(() => a._f()).to.throw('Cannot call private method _f')
        }
        const a = new A()
        test(a)
        await a.sync()
        const a2 = await run.load(a.location)
        test(a2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        test(a3)
      })

      // ----------------------------------------------------------------------

      it('throws from different jig of different class', async () => {
        const run = new Run()
        class A extends Jig { _g () { return 1 } }
        class B extends Jig { f (a) { return a._g() } }
        function test (a, b) { expect(() => b.f(a)).to.throw('Cannot get private property _g') }
        const a = new A()
        const b = new B()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })

      // ----------------------------------------------------------------------

      it('available from different jig of same class', async () => {
        const run = new Run()
        class A extends Jig {
          _g () { return 1 }
          f (a) { return a._g() }
        }
        function test (a, b) { expect(b.f(a)).to.equal(1) }
        const a = new A()
        const b = new A()
        test(a, b)
        await run.sync()
        const a2 = await run.load(a.location)
        const b2 = await run.load(b.location)
        test(a2, b2)
        run.cache = new LocalCache()
        const a3 = await run.load(a.location)
        const b3 = await run.load(b.location)
        test(a3, b3)
      })
    })
  })

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('available from same class', async () => {
      const run = new Run()
      class A extends Jig { static f () { return this._n } }
      A._n = 1
      const CA = run.deploy(A)
      function test (CA) { expect(CA.f()).to.equal(1) }
      test(CA)
      await CA.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('properties available externally', async () => {
      const run = new Run()
      class A extends Jig { }
      A._n = 1
      const CA = run.deploy(A)
      function test (CA) { expect(CA._n).to.equal(1) }
      test(CA)
      await CA.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('methods uncallable externally', async () => {
      const run = new Run()
      class A extends Jig { static _f () { return 1 } }
      const CA = run.deploy(A)
      function test (CA) { expect(() => CA._f()).to.throw('Cannot call private method _f') }
      test(CA)
      await CA.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws from child class', async () => {
      const run = new Run()
      class A extends Jig { static _g () { return 1 } }
      class B extends A { static f (a) { return a._g() } }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      function test (CA, CB) { expect(() => CB.f(CA)).to.throw('Cannot get private property _g') }
      test(CA, CB)
      await CA.sync()
      await CB.sync()
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(CA2, CB2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(CA3, CB3)
    })

    // ------------------------------------------------------------------------

    it('available from instance', async () => {
      const run = new Run()
      class A extends Jig {
        static _g () { return 1 }
        f () { return A._g() }
      }
      const a = new A()
      function test (a) { expect(a.f()).to.equal(1) }
      test(a)
      await a.sync()
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('can access instance', async () => {
      const run = new Run()
      class A extends Jig {
        static f (a) { return a._g() }
        _g () { return 1 }
      }
      const CA = await run.deploy(A)
      const a = new A()
      function test (CA, a) { expect(CA.f(a)).to.equal(1) }
      test(CA, a)
      await a.sync()
      await CA.sync()
      const a2 = await run.load(a.location)
      const CA2 = await run.load(CA.location)
      test(CA2, a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      const CA3 = await run.load(CA.location)
      test(CA3, a3)
    })

    // ------------------------------------------------------------------------

    it('throws if access from child instance', async () => {
      const run = new Run()
      class A extends Jig {
        static _g () { return 1 }
        f () { return A._g() }
      }
      class B extends A { }
      const a = new A()
      const b = new B()
      function test (a, b) { expect(() => b.f(a)).to.throw('Cannot get private property _g') }
      test(a, b)
      await a.sync()
      await b.sync()
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      test(a2, b2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      const b3 = await run.load(b.location)
      test(a3, b3)
    })
  })

  // --------------------------------------------------------------------------
  // Sidekick Code
  // --------------------------------------------------------------------------

  describe('Sidekick Code', () => {
    it('available from outside', async () => {
      const run = new Run()
      class A { }
      A._n = 1
      function test (A) { expect(A._n).to.equal(1) }
      const CA = run.deploy(A)
      test(CA)
      await CA.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('available from another jig', async () => {
      const run = new Run()
      class A { }
      A._n = 1
      class B extends Jig { static f (A) { return A._n } }
      function test (A, B) { expect(B.f(A)).to.equal(1) }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      test(CA, CB)
      await CA.sync()
      await CB.sync()
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(CA2, CB2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(CA3, CB3)
    })

    // ------------------------------------------------------------------------

    it('access through static helper', async () => {
      const run = new Run()
      function read (A) { return A._n }
      class A extends Jig { static f () { return read(this) } }
      A.deps = { read }
      A._n = 1
      const CA = run.deploy(A)
      await CA.sync()
      function test (A) { expect(A.f()).to.equal(1) }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })
  })

  // --------------------------------------------------------------------------
  // Inner objects
  // --------------------------------------------------------------------------

  describe('Inner objects', () => {
    it('available externally', async () => {
      const run = new Run()
      class A extends Jig { }
      A.a = []
      A.a._a = 1
      A.m = new Map()
      A.m._b = 1
      A.m.set(10, { _c: 1 })
      const CA = run.deploy(A)
      function test (CA) {
        expect(CA.a._a).to.equal(1)
        expect(CA.m._b).to.equal(1)
        expect(CA.m.get(10)._c).to.equal(1)
      }
      await CA.sync()
      test(CA)
      const CA2 = await run.load(A.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(A.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws from another jig', async () => {
      const run = new Run()
      class A extends Jig { }
      A.a = []
      A.a._a = 1
      A.m = new Map()
      A.m._b = 1
      A.m.set(10, { _c: 1 })
      const CA = run.deploy(A)
      class B extends Jig {
        static f () { return A.a._a }
        static g () { return A.a._b }
        static h () { return A.m.get(10)._c }
      }
      B.deps = { A: CA }
      const CB = run.deploy(B)
      function test (CB) {
        expect(() => CB.f()).to.throw('Cannot get private property _a')
        expect(() => CB.g()).to.throw('Cannot get private property _b')
        expect(() => CB.h()).to.throw('Cannot get private property _c')
      }
      await CB.sync()
      test(CB)
      const CB2 = await run.load(B.location)
      test(CB2)
      run.cache = new LocalCache()
      const CB3 = await run.load(B.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('ownKeys includes all externally and internally', async () => {
      const run = new Run()
      class A extends Jig {
        init () { this.o = { _n: 1 } }
        keys () { return Reflect.ownKeys(this.o) }
      }
      const a = new A()
      await a.sync()
      function test (a) {
        expect(Reflect.ownKeys(a.o).includes('_n')).to.equal(true)
        expect(a.keys().includes('_n')).to.equal(true)
      }
      test(a)
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('ownKeys filters from another jig', async () => {
      const run = new Run()
      class A extends Jig {
        init () { this.o = { _n: 1 } }
        keys () { return Reflect.ownKeys(this.o) }
      }
      const a = new A()
      class B extends Jig { static f (a) { return Reflect.ownKeys(a.o) } }
      const CB = run.deploy(B)
      await run.sync()
      function test (CB, a) {
        expect(CB.f(a).includes('_n')).to.equal(false)
      }
      test(CB, a)
      const CB2 = await run.load(CB.location)
      const a2 = await run.load(a.location)
      test(CB2, a2)
      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      const a3 = await run.load(a.location)
      test(CB3, a3)
    })

    // ------------------------------------------------------------------------

    it('has throws', async () => {
      const run = new Run()
      class A extends Jig { }
      A.o = { }
      const CA = run.deploy(A)
      class B extends Jig { has (A) { return '_n' in A.o } }
      const b = new B()
      await CA.sync()
      await b.sync()
      function test (CA, b) { expect(() => b.has(CA)).to.throw('Cannot check private property _n') }
      test(CA, b)
      const CA2 = await run.load(CA.location)
      const b2 = await run.load(b.location)
      test(CA2, b2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const b3 = await run.load(b.location)
      test(CA3, b3)
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('no private properties', async () => {
      new Run() // eslint-disable-line
      class B extends Berry {
        init () { this._n = 1 }
        _g () { return 2 }
      }
      class A extends Jig {
        f (b) { return b._n }
        g (b) { return b._g() }
      }
      const a = new A()
      const b = await B.load('abc')
      expect(a.f(b)).to.equal(1)
      expect(a.g(b)).to.equal(2)
    })
  })
})

// ------------------------------------------------------------------------------------------------
