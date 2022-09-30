/**
 * call.js
 *
 * Tests for the call action
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry } = Run
const { LocalCache } = Run.plugins
const { expectTx } = require('../env/misc')

// ------------------------------------------------------------------------------------------------
// Call
// ------------------------------------------------------------------------------------------------

describe('Call', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('calls static get method on jig', async () => {
      const run = new Run()
      class A extends Jig { static f (x) { return 123 + x } }
      const C = run.deploy(A)
      await C.sync()
      const location = C.location
      expect(C.f(1)).to.equal(124)
      expect(C.origin).to.equal(C.location)
      expect(C.location).to.equal(location)
    })

    // ------------------------------------------------------------------------

    it('calls static set method on jig', async () => {
      const run = new Run()

      class A extends Jig { static f (x) { this.x = x } }
      const C = run.deploy(A)
      await C.sync()

      function test (C2) {
        expect(C2.location).not.to.equal(C2.origin)
        expect(C.location).to.equal(C2.location)
        expect(C.x).to.equal(C2.x)
      }

      C.f(1)
      expect(C.x).to.equal(1)
      await C.sync()
      test(C)

      const C2 = await run.load(C.location)
      test(C2)

      run.cache = new LocalCache()
      const C3 = await run.load(C.location)
      test(C3)
    })

    // ------------------------------------------------------------------------

    it('can only call static methods on class they are from', async () => {
      const run = new Run()

      class A extends Jig {
        static f () { this.calledF = 'a' }
        static g () { this.calledG = 'a' }
      }

      class B extends A {
        static g () { this.calledG = 'b' }
        static h () { this.calledH = 'b' }
      }

      const CA = run.deploy(A)
      await CA.sync()

      const CB = run.deploy(B)
      await CB.sync()

      CA.f()
      CA.g()
      await CA.sync()
      expect(Object.getOwnPropertyDescriptor(CA, 'calledF').value).to.equal('a')
      expect(Object.getOwnPropertyDescriptor(CA, 'calledG').value).to.equal('a')

      CB.g()
      CB.h()
      expect(Object.getOwnPropertyDescriptor(CB, 'calledG').value).to.equal('b')
      expect(Object.getOwnPropertyDescriptor(CB, 'calledH').value).to.equal('b')

      expect(() => CA.g.apply(CB, [])).to.throw('Cannot call g on B')
    })

    // ------------------------------------------------------------------------

    it('throws for unsupported args', () => {
      const run = new Run()
      class A extends Jig { static f () { } }
      const C = run.deploy(A)
      expect(() => C.f(Symbol.hasInstance)).to.throw('Cannot clone')
    })

    // ------------------------------------------------------------------------

    it('calls super', async () => {
      const run = new Run()
      class A extends Jig { static f () { return 1 } }
      class B extends A { static g () { this.n = super.f() + 10 } }
      const CB = run.deploy(B)
      await CB.sync()

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [
              { $jig: 0 },
              'g',
              []
            ]
          }
        ]
      })

      function test (CB) { expect(CB.n).to.equal(11) }

      CB.g()
      await CB.sync()
      test(CB)

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })
  })

  // --------------------------------------------------------------------------
  // Sidekick Code
  // --------------------------------------------------------------------------

  describe('Sidekick Code', () => {
    it('calls method with passthrough args', async () => {
      const run = new Run()

      class A {
        static f (x) {
          if (x !== Symbol.hasInstance) throw new Error()
          if (this !== A) throw new Error()
          return Symbol.iterator
        }
      }

      function test (C2) {
        expect(C2.f(Symbol.hasInstance)).to.equal(Symbol.iterator)
      }

      const C = run.deploy(A)
      await C.sync()
      test(C)

      const C2 = await run.load(C.location)
      test(C2)

      run.cache = new LocalCache()
      const C3 = await run.load(C.location)
      test(C3)
    })

    // ------------------------------------------------------------------------

    it('calls super', async () => {
      const run = new Run()
      class A { static f () { return 1 } }
      class B extends A { static f () { return super.f() + 10 } }
      const CB = run.deploy(B)
      await CB.sync()
      test(CB)
      function test (CB) { expect(CB.f()).to.equal(11) }
      const CB2 = await run.load(CB.location)
      test(CB2)
      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('update basic jig', async () => {
      const run = new Run()
      class Sword extends Jig {
        upgrade () { this.upgrades = (this.upgrades || 0) + 1 }
      }
      const sword = new Sword()
      await sword.sync()

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [
              { $jig: 0 },
              'upgrade',
              []
            ]
          }
        ]
      })

      function test (sword) {
        expect(sword.upgrades).to.equal(1)
      }

      sword.upgrade()
      await sword.sync()
      test(sword)

      const sword2 = await run.load(sword.location)
      test(sword2)

      run.cache = new LocalCache()
      const sword3 = await run.load(sword.location)
      test(sword3)
    })

    // ------------------------------------------------------------------------

    it('adds class references for each super call', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { h () { return 1 } }
      class B extends A { g () { return super.h() + 2 } }
      class C extends B { f () { return super.g() + 3 } }
      const c = new C()
      await c.sync()

      expectTx({
        nin: 1,
        nref: 3,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [
              { $jig: 0 },
              'f',
              []
            ]
          }
        ]
      })

      c.f()
      await c.sync()
    })

    // ------------------------------------------------------------------------

    it('pass null in args', async () => {
      const run = new Run()
      class Dragon extends Jig {
        init (lair) {
          this.lair = lair
        }
      }
      await run.deploy(Dragon).sync()

      expectTx({
        nin: 0,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'NEW',
            data: [
              { $jig: 0 },
              [null]
            ]
          }
        ]
      })

      const dragon = new Dragon(null)
      await dragon.sync()

      run.cache = new LocalCache()
      const dragon2 = await run.load(dragon.location)

      expect(dragon).to.deep.equal(dragon2)
    })

    // ------------------------------------------------------------------------

    it('swap inner jigs', async () => {
      const run = new Run()
      class A extends Jig {
        init (name) { this.name = name }
        setX (a) { this.x = a }

        setY (a) { this.y = a }

        swapXY () { const t = this.x; this.x = this.y; this.y = t }
      }
      const a = new A('a')
      const b = new A('b')
      const c = new A('c')
      a.setX(b)
      a.setY(c)
      a.swapXY()

      function test (a) {
        expect(a.x).not.to.equal(a.y)
        expect(a.x.name).to.equal('c')
        expect(a.y.name).to.equal('b')
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

    it('restores old state if method throws', () => {
      new Run() // eslint-disable-line
      class Outer extends Jig { setN () { this.n = 1 } }
      class Inner extends Jig { setZ () { this.z = 1 } }
      class Revertable extends Jig {
        init () {
          this.n = 1
          this.arr = ['a', { b: 1 }]
          this.self = this
          this.inner = new Inner()
        }

        methodThatThrows (outer) {
          outer.setN()
          this.n = 2
          this.arr[1].b = 2
          this.arr.push(3)
          this.inner.setZ()
          throw new Error('an error')
        }
      }
      Revertable.deps = { Inner }
      const main = new Revertable()
      const outer = new Outer()
      expect(() => main.methodThatThrows(outer)).to.throw()
      expect(main.n).to.equal(1)
      expect(main.arr).to.deep.equal(['a', { b: 1 }])
      expect(main.self).to.equal(main)
      expect(main.inner.z).to.equal(undefined)
      expect(outer.n).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if swallow internal errors', () => {
      new Run() // eslint-disable-line
      class B extends Jig { init () { throw new Error('some error message') } }
      class A extends Jig { f () { try { return new B() } catch (e) { } } }
      A.deps = { B }
      const a = new A()
      expect(() => a.f()).to.throw('some error message')
    })

    // ------------------------------------------------------------------------

    it('call super', async () => {
      const run = new Run()
      class A extends Jig { h () { this.a = true } }
      class B extends A { g () { super.h(); this.b = true } }
      class C extends B { f () { super.g(); this.c = true } }

      function test (c) {
        expect(c.a).to.equal(true)
        expect(c.b).to.equal(true)
        expect(c.c).to.equal(true)
      }

      const c = new C()
      c.f()
      test(c)
      await c.sync()

      const c2 = await run.load(c.location)
      test(c2)

      run.cache = new LocalCache()
      const c3 = await run.load(c.location)
      test(c3)
    })

    // ------------------------------------------------------------------------

    it('call static helper', async () => {
      const run = new Run()
      class Preconditions { static checkArgument (b) { if (!b) throw new Error() } }
      class A extends Jig { set (n) { $.checkArgument(n > 0); this.n = n } } // eslint-disable-line
      A.deps = { $: Preconditions }
      const a = new A()
      expect(() => a.set(0)).to.throw()
      await a.sync()
      expectTx({
        nin: 1,
        nref: 2,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'CALL',
            data: [
              { $jig: 0 },
              'set',
              [1]
            ]
          }
        ]
      })
      a.set(1)
      await a.sync()
      await run.load(a.location)
      run.cache = new LocalCache()
      await run.load(a.location)
    })

    // ------------------------------------------------------------------------

    it('throws if set directly on another jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        setB (b) { this.b = b }
        g () { this.b.n = 1 }
      }
      class B extends Jig {
        setA (a) { this.a = a }
        f () { this.a.g() }
      }
      const a = new A()
      const b = new B()
      a.setB(b)
      b.setA(a)
      expect(() => b.f()).to.throw('Attempt to update [jig B] outside of a method')
    })

    // ------------------------------------------------------------------------

    it('throws if set in object on another jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        setB (b) { this.b = b }
        g () { this.b.o.n = 1 }
      }
      class B extends Jig {
        init () { this.o = { } }
        setA (a) { this.a = a }
        f () { this.a.g() }
      }
      const a = new A()
      const b = new B()
      a.setB(b)
      b.setA(a)
      expect(() => b.f()).to.throw('Attempt to update [jig B] outside of a method')
    })
    // ------------------------------------------------------------------------

    it('throws if async', async () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        async f () {}
        g () { return new Promise((resolve, reject) => { }) }
      }
      const a = new A()
      expect(() => a.f()).to.throw('async methods not supported')
      expect(() => a.g()).to.throw('async methods not supported')
    })

    // ------------------------------------------------------------------------

    it('throws if modify claimed return values', async () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f () {
          const x = { }
          this.x = x
          return x
        }
      }
      const a = new A()
      const error = 'Attempt to update [jig A] outside of a method'
      expect(() => { a.f().n = 1 }).to.throw(error)
      class B extends Jig {
        f (a) { a.f().n = 1 }
      }
      const b = new B()
      expect(() => b.f(a)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('allowed to modify claimed return values', async () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f () {
          return { }
        }
      }
      const a = new A()
      expect(() => { a.f().n = 1 }).not.to.throw()
      class B extends Jig {
        f (a) { a.f().n = 1 }
      }
      const b = new B()
      expect(() => b.f(a)).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if call class method on instance', () => {
      new Run() // eslint-disable-line
      class A extends Jig { static set () { this.n = 1 } }
      const a = new A()
      expect(() => a.constructor.set.apply(a)).to.throw('Cannot call set on [jig A]')
    })

    // ------------------------------------------------------------------------

    it('throws if call inner method on jig', async () => {
      new Run() // eslint-disable-line
      class B { f (a) { return this.n } }
      class A extends Jig {
        init () { this.b = [] }
        f () { return this.b.filter.apply(this) }
      }
      A.deps = { B }
      const a = new A()
      await a.sync()
      expect(() => a.f()).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // Arguments
  // --------------------------------------------------------------------------

  describe('Arguments', async () => {
    async function testArgumentPass (args, testEquality = true) {
      const run = new Run()
      if (typeof args === 'function') args = args(run)
      class A extends Jig { f (...args) { this.args = args } }
      const a = new A()
      function test (a) { if (testEquality) expect(args).to.deep.equal(a.args) }
      a.f(...args)
      test(a)
      await a.sync()
      const a2 = await run.load(a.location)
      test(a2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    }

    // ------------------------------------------------------------------------

    it('nothing', () => testArgumentPass([]))
    it('positive zero', () => testArgumentPass([0]))
    it('negative zero', () => testArgumentPass([-0]))
    it('integer', () => testArgumentPass([1]))
    it('negative float', () => testArgumentPass([-1.5]))
    it('min integer', () => testArgumentPass([Number.MIN_SAFE_INTEGER]))
    it('max value', () => testArgumentPass([Number.MAX_VALUE]))
    it('NaN', () => testArgumentPass([NaN]))
    it('Infinity', () => testArgumentPass([Infinity]))
    it('true', () => testArgumentPass([true]))
    it('false', () => testArgumentPass([false]))
    it('empty string', () => testArgumentPass(['']))
    it('normal strings', () => testArgumentPass(['abc']))
    it('object', () => testArgumentPass([{}]))
    it('array', () => testArgumentPass([[]]))
    it('set', () => testArgumentPass([new Set(['a', {}, null])], false))
    it('map', () => testArgumentPass([new Map([[0, 0]])], false))
    it('multiple', () => testArgumentPass([1, true, 'a', [], {}, new Set(), new Map()], false))
    const o = { }
    o.o = o
    it('circular reference', () => testArgumentPass([o]))
    it('arbitrary object', () => testArgumentPass(run => {
      const Blob = run.deploy(class Blob {})
      return [new Blob()]
    }))
    it('code', () => testArgumentPass(run => [run.deploy(class Blob {})], false))
    it('jig', () => testArgumentPass(run => [new (class A extends Jig { })()], false))
    it('undeployed arbitrary object', () => testArgumentPass(run => [new (class Blob {})()], false))
    it('undeployed jig class', () => testArgumentPass(run => [class A extends Jig {}], false))
    it('undeployed sidekick class', () => testArgumentPass(run => [class A {}], false))
    it('undeployed sidekick function', () => testArgumentPass(run => [function f () { }], false))

    it('berry', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('abc')
      testArgumentPass(b)
    })

    // ------------------------------------------------------------------------

    it('deploys code in args', async () => {
      const run = new Run()
      class A extends Jig { }
      class B { }

      expectTx({
        nin: 0,
        nref: 1,
        nout: 3,
        ndel: 0,
        ncre: 3,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A extends Jig { }',
              {
                deps: {
                  Jig: { $jig: 0 }
                }
              }
            ]
          },
          {
            op: 'DEPLOY',
            data: [
              'class B { }',
              { deps: { } }
            ]
          },
          {
            op: 'NEW',
            data: [
              { $jig: 1 },
              [{ $jig: 2 }]
            ]
          }
        ]
      })

      const a = new A(B)
      await a.sync()

      await run.load(a.location)

      run.cache = new LocalCache()
      await run.load(a.location)
    })

    // ------------------------------------------------------------------------

    function testArgumentFail (...args) {
      new Run() // eslint-disable-line
      class A extends Jig { f (...args) { this.args = args } }
      const a = new A()
      expect(() => a.f(...args)).to.throw()
    }

    // ------------------------------------------------------------------------

    it('throws if symbol', () => testArgumentFail(Symbol.hasInstance))
    it('throws if built-in intrinsic', () => testArgumentFail(Math))
    it('throws if date', () => testArgumentFail(new Date()))
    it('throws if anonymous function', () => testArgumentFail(() => {}))

    // ------------------------------------------------------------------------

    it('change args from outside', async () => {
      const run = new Run()
      class A extends Jig { f (arr, obj) { arr.pop(); obj.n = 1; this.n = 0 } }
      const a = new A()
      const arr = [1]
      const obj = { n: 0 }
      a.f(arr, obj)
      expect(arr.length).to.equal(1)
      expect(obj.n).to.equal(0)
      await a.sync()
      await run.load(a.location)
      run.cache = new LocalCache()
      await run.load(a.location)
    })

    // ------------------------------------------------------------------------

    it('change args from another jig', async () => {
      const run = new Run()
      class A extends Jig { f (arr, obj) { arr.pop(); obj.n = 1; this.n = 0 } }
      class B extends Jig {
        test (a) {
          const arr = [1]
          const obj = { n: 0 }
          a.f(arr, obj)
          this.result = arr.length === 1 && obj.n === 0
        }
      }
      const a = new A()
      const b = new B()
      b.test(a)
      expect(b.result).to.equal(true)
      await b.sync()
      const b2 = await run.load(b.location)
      expect(b2.result).to.equal(true)
      run.cache = new LocalCache()
      const b3 = await run.load(b.location)
      expect(b3.result).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('compare jig constructors', async () => {
      const run = new Run()
      class A extends Jig {
        init (b) {
          this.test = b.constructor === B
        }
      }
      class B extends Jig { }
      A.deps = { B }
      B.deps = { A }
      run.deploy(A)
      run.deploy(B)
      await run.sync()
      const b = new B()
      const a = new A(b)
      expect(a.test).to.equal(true)
      await run.sync()
      await run.load(a.location)
      await run.load(b.location)
      run.cache = new LocalCache()
      await run.load(a.location)
      await run.load(b.location)
    })

    // ------------------------------------------------------------------------

    it('sorts keys deterministically from outside', async () => {
      const run = new Run()
      class A extends Jig {
        init (obj) {
          this.argKeys = Object.keys(obj)
        }
      }

      expectTx({
        nin: 0,
        nref: 1,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                deps: {
                  Jig: { $jig: 0 }
                }
              }
            ]
          },
          {
            op: 'NEW',
            data: [
              { $jig: 1 },
              [{ a: 2, b: 1 }]
            ]
          }
        ]
      })

      function test (a) { expect(a.argKeys).to.deep.equal(['a', 'b']) }

      const obj = { b: 1, a: 2 }
      expect(Object.keys(obj)).to.deep.equal(['b', 'a'])
      const a = new A(obj)
      await a.sync()
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('sorts keys deterministically from another jig', async () => {
      const run = new Run()

      class A extends Jig {
        init () {
          this.b = new B({ a: { 2: 1, 1: 2 }, b: 3 })
        }
      }

      class B extends Jig {
        init (obj) {
          this.objKeys = Object.keys(obj)
          this.aKeys = Object.keys(obj.a)
        }
      }

      A.deps = { B }

      function test (a) {
        expect(a.b.objKeys).to.deep.equal(['a', 'b'])
        expect(a.b.aKeys).to.deep.equal(['1', '2'])
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

    it('does not sort keys from inside', async () => {
      const run = new Run()

      class A extends Jig {
        init () {
          this.f({ b: 1, a: 0 })
        }

        f (obj) {
          this.objKeys = Object.keys(obj)
        }
      }

      function test (a) {
        expect(a.objKeys).to.deep.equal(['b', 'a'])
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

    it('arguments are copied from outside', () => {
      const run = new Run()
      class A extends Jig { static f (x) { x.push(1) } }
      const CA = run.deploy(A)
      const arr = []
      CA.f(arr)
      expect(arr.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('arguments are copied from another jig', () => {
      const run = new Run()
      class A extends Jig { static f (x) { x.push(1) } }
      class B extends Jig { static g (a) { const arr = []; a.f(arr); return arr.length } }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CB.g(CA)).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('arguments are passed through from inside', () => {
      const run = new Run()
      class A extends Jig {
        static f (x) { x.push(1) }
        static g () { const arr = []; this.f(arr); return arr.length }
      }
      const CA = run.deploy(A)
      expect(CA.g()).to.equal(1)
    })
  })
})

// ------------------------------------------------------------------------------------------------
