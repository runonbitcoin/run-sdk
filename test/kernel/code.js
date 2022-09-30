/**
 * code.js
 *
 * Tests for Code functionality once deployed
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { expectTx } = require('../env/misc')
const PrivateKey = require('bsv/lib/privatekey')
const { Code, Jig, Berry } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

// Methods available on all code instances
const CODE_METHODS = ['upgrade', 'sync', 'destroy', 'auth', Symbol.hasInstance]

// ------------------------------------------------------------------------------------------------
// Code
// ------------------------------------------------------------------------------------------------

describe('Code', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // toString
  // --------------------------------------------------------------------------

  describe('toString', () => {
    it('returns source code for class', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(CA.toString().startsWith('class A')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns source code for function', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      expect(cf.toString().startsWith('function f')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns source code for jig class', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      expect(CA.toString().startsWith('class A extends Jig')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns source code for child code class', () => {
      const run = new Run()
      class A { }
      class B extends A { }
      const CB = run.deploy(B)
      expect(CB.toString().startsWith('class B')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns source code for child non-code class', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B extends CA { }
      expect(B.toString().startsWith('class B')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns same method for different code', () => {
      const run = new Run()
      class A { }
      function f () { }
      const CA = run.deploy(A)
      const cf = run.deploy(f)
      expect(CA.toString).to.equal(cf.toString)
      expect(CA.toString()).not.to.equal(cf.toString())
    })
  })

  // --------------------------------------------------------------------------
  // Code methods
  // --------------------------------------------------------------------------

  describe('Code methods', () => {
    it('adds invisible code methods to class', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CODE_METHODS.forEach(name => expect(typeof CA[name]).to.equal('function'))
      CODE_METHODS.forEach(name => expect(name in CA).to.equal(true))
      CODE_METHODS.forEach(name => expect(Object.getOwnPropertyNames(CA).includes(name)).to.equal(false))
    })

    // ------------------------------------------------------------------------

    it('adds invisible code methods to function', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      CODE_METHODS.forEach(name => expect(typeof cf[name]).to.equal('function'))
      CODE_METHODS.forEach(name => expect(name in cf).to.equal(true))
      CODE_METHODS.forEach(name => expect(Object.getOwnPropertyNames(cf).includes(name)).to.equal(false))
    })

    // ------------------------------------------------------------------------

    it('code methods for class are always the same', () => {
      const run = new Run()
      class A { }
      class B { }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CA.upgrade).to.equal(CA.upgrade)
      expect(CA.sync).to.equal(CB.sync)
    })

    // ------------------------------------------------------------------------

    it('code methods for class are frozen', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CODE_METHODS.forEach(name => expect(Object.isFrozen(CA[name])))
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('initial bindings are unreadable', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(() => CA.location).to.throw('Cannot read location')
      expect(() => CA.origin).to.throw('Cannot read origin')
      expect(() => CA.nonce).to.throw('Cannot read nonce')
      expect(() => CA.owner).to.throw('Cannot read owner')
      expect(() => CA.satoshis).to.throw('Cannot read satoshis')
    })

    // ------------------------------------------------------------------------

    it('does not return bindings of parent class', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await CA.sync()
      class B extends CA { }
      expect(typeof B.origin).to.equal('undefined')
      expect(typeof B.location).to.equal('undefined')
      expect(typeof B.nonce).to.equal('undefined')
      expect(typeof Reflect.get(B, 'owner')).to.equal('undefined')
      expect(typeof Reflect.get(B, 'satoshis')).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('name is correct', () => {
      const run = new Run()
      class A { }
      expect(run.deploy(A).name).to.equal('A')
      function f () { }
      expect(run.deploy(f).name).to.equal('f')
      class B extends A { }
      expect(run.deploy(B).name).to.equal('B')
    })

    // ------------------------------------------------------------------------

    it('returns code by name', () => {
      const run = new Run()
      class A { static getThis () { return A } }
      const A2 = run.deploy(A)
      expect(A2.getThis()).to.equal(A2)
      function f () { return f }
      const f2 = run.deploy(f)
      expect(f2()).to.equal(f2)
    })

    // ------------------------------------------------------------------------

    it('returns parent property if not set on child', () => {
      const run = new Run()
      class A { }
      A.n = 1
      class B extends A { }
      const CB = run.deploy(B)
      expect(CB.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('same method is returned every time', () => {
      const run = new Run()
      class A { static f () { } }
      const CA = run.deploy(A)
      expect(typeof CA.f).to.equal('function')
      expect(CA.f).to.equal(CA.f)
    })

    // ------------------------------------------------------------------------

    it('same method is returned for child code', () => {
      const run = new Run()
      class A { static f () { } }
      const CA = run.deploy(A)
      class B extends CA {}
      const CB = run.deploy(B)
      expect(typeof CB.f).to.equal('function')
      expect(CB.f).to.equal(CA.f)
    })
  })

  // --------------------------------------------------------------------------
  // delete
  // --------------------------------------------------------------------------

  describe('delete', () => {
    it('throws if external', () => {
      const run = new Run()
      class A extends Jig { }
      A.n = 1
      const CA = run.deploy(A)
      const error = 'Attempt to update A outside of a method'
      expect(() => { delete CA.n }).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('allowed inside', async () => {
      const run = new Run()
      class A extends Jig { static f () { delete this.n } }
      A.n = 1
      const CA = run.deploy(A)
      CA.f()
      test(CA)
      await CA.sync()
      function test (CA) { expect('n' in CA).to.equal(false) }
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('deletes on current class not parent', async () => {
      const run = new Run()
      class A extends Jig { static f () { delete this.n } }
      A.n = 1
      class B extends A { }
      const CB = run.deploy(B)
      function test (CB) { expect(CB.n).to.equal(1) }
      CB.f()
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
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('throws if external', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      const error = 'Attempt to update A outside of a method'
      expect(() => { CA.n = 1 }).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('allowed internally', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      const CA = run.deploy(A)
      CA.f()
      await CA.sync()
      function test (CA) { expect(CA.n).to.equal(1) }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('overrides parent on child', async () => {
      const run = new Run()
      class A extends Jig { static f (n) { this.n = n } }
      class B extends A { }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      CA.f(1)
      CB.f(2)
      await CB.sync()
      await CA.sync()
      function test (CA, CB) {
        expect(CA.n).to.equal(1)
        expect(CB.n).to.equal(2)
      }
      test(CA, CB)
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(CA2, CB2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(CA3, CB3)
    })
  })

  // --------------------------------------------------------------------------
  // defineProperty
  // --------------------------------------------------------------------------

  describe('defineProperty', () => {
    it('throws if external', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      const desc = { value: true, configurable: true, enumerable: true, writable: true }
      const error = 'Attempt to update A outside of a method'
      expect(() => Object.defineProperty(CA, 'n', desc)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('defines on current class', async () => {
      const run = new Run()
      class A extends Jig {
        static f (s) {
          const desc = { value: s, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(this, 's', desc)
        }
      }
      class B extends A { }
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      CA.f('abc')
      CB.f('def')
      await CB.sync()
      await CA.sync()
      function test (CA, CB) {
        expect(CA.s).to.equal('abc')
        expect(CB.s).to.equal('def')
      }
      test(CA, CB)
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(CA2, CB2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(CA3, CB3)
    })
  })

  // --------------------------------------------------------------------------
  // instanceof
  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('deployed classes returns true', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(CA instanceof Code).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('deployed functions returns true', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      expect(cf instanceof Code).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('non-code return false', () => {
      expect(class A { } instanceof Code).to.equal(false)
      expect(function f () { } instanceof Code).to.equal(false)
      expect(undefined instanceof Code).to.equal(false)
      expect(true instanceof Code).to.equal(false)
      expect({} instanceof Code).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('native code return true', () => {
      expect(Jig instanceof Code).to.equal(true)
      expect(Berry instanceof Code).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('arbitrary object instanceof non-jig code', () => {
      const run = new Run()
      const C = run.deploy(class A { })
      const a = new C()
      expect(a instanceof C).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('arbitrary object instanceof non-jig local', () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      const a = new C()
      expect(a instanceof A).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // getOwnPropertyDescriptor
  // --------------------------------------------------------------------------

  describe('getOwnPropertyDescriptor', () => {
    it('returns undefined for code methods', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CODE_METHODS.forEach(name => expect(Object.getOwnPropertyDescriptor(CA, name)).to.equal(undefined))
    })
  })

  // --------------------------------------------------------------------------
  // isExtensible
  // --------------------------------------------------------------------------

  describe('isExtensible', () => {
    it('returns true', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(Object.isExtensible(CA)).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // preventExtensions
  // --------------------------------------------------------------------------

  describe('preventExtensions', () => {
    it('throws externally', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      expect(() => Object.preventExtensions(CA)).to.throw('preventExtensions disabled')
    })

    // ------------------------------------------------------------------------

    it('throws internally', () => {
      const run = new Run()
      class A extends Jig { static f () { Object.preventExtensions(this) } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('preventExtensions disabled')
    })
  })

  // --------------------------------------------------------------------------
  // setPrototypeOf
  // --------------------------------------------------------------------------

  describe('setPrototypeOf', () => {
    it('throws externally', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      expect(() => Object.setPrototypeOf(CA, {})).to.throw('setPrototypeOf disabled')
    })

    // ------------------------------------------------------------------------

    it('throws internally', () => {
      const run = new Run()
      class A extends Jig { static f () { Object.setPrototypeOf(this, { }) } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('setPrototypeOf disabled')
    })

    // ------------------------------------------------------------------------

    it('allowed on non-code child', () => {
      const run = new Run()
      class A extends Jig {}
      const CA = run.deploy(A)
      class B extends CA { }
      Object.setPrototypeOf(B, {})
    })
  })

  // --------------------------------------------------------------------------
  // Bindings
  // --------------------------------------------------------------------------

  describe('Bindings', () => {
    it('throws if delete', async () => {
      const run = new Run()
      class A extends Jig { static f (name) { delete this[name] } }
      const CA = run.deploy(A)
      await CA.sync()
      function test (A) {
        expect(() => A.f('location')).to.throw('Cannot delete location')
        expect(() => A.f('origin')).to.throw('Cannot delete origin')
        expect(() => A.f('nonce')).to.throw('Cannot delete nonce')
        expect(() => A.f('owner')).to.throw('Cannot delete owner')
        expect(() => A.f('satoshis')).to.throw('Cannot delete satoshis')
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if set location, origin, or nonce', async () => {
      const run = new Run()
      class A extends Jig { static f (name, value) { this[name] = value } }
      const CA = run.deploy(A)
      await CA.sync()
      function test (A) {
        expect(() => A.f('location', '123')).to.throw('Cannot set location')
        expect(() => A.f('origin', '123')).to.throw('Cannot set origin')
        expect(() => A.f('nonce', 10)).to.throw('Cannot set nonce')
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if define location, origin, or nonce', async () => {
      const run = new Run()
      class A extends Jig {
        static f (name, value) {
          const desc = { value, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(this, name, desc)
        }
      }
      const CA = run.deploy(A)
      await CA.sync()
      function test (A) {
        expect(() => A.f('location', '123')).to.throw('Cannot define location')
        expect(() => A.f('origin', '123')).to.throw('Cannot define origin')
        expect(() => A.f('nonce', 10)).to.throw('Cannot define nonce')
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('set owner', async () => {
      const run = new Run()
      class A extends Jig { static f (owner) { this.owner = owner } }
      const CA = run.deploy(A)
      const pubkey = new PrivateKey().toPublicKey().toString()
      CA.f(pubkey)
      await CA.sync()
      function test (CA) { expect(CA.owner).to.equal(pubkey) }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if set invalid owner', async () => {
      const run = new Run()
      class A extends Jig { static f (owner) { this.owner = owner } }
      const CA = run.deploy(A)
      await CA.sync()
      function test (CA) {
        expect(() => CA.f('123')).to.throw('Invalid owner')
        expect(() => CA.f(null)).to.throw('Invalid owner')
        expect(() => CA.f(undefined)).to.throw('Invalid owner')
        expect(() => CA.f(true)).to.throw('Invalid owner')
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('set satoshis', async () => {
      const run = new Run()
      class A extends Jig { static f (satoshis) { this.satoshis = satoshis } }
      const CA = run.deploy(A)
      CA.f(1000)
      await CA.sync()
      function test (CA) { expect(CA.satoshis).to.equal(1000) }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if set invalid satoshis', async () => {
      const run = new Run()
      class A extends Jig { static f (satoshis) { this.satoshis = satoshis } }
      const CA = run.deploy(A)
      await CA.sync()
      function test (CA) {
        expect(() => CA.f('123')).to.throw()
        expect(() => CA.f(-1)).to.throw()
        expect(() => CA.f(1.5)).to.throw()
        expect(() => CA.f(Number.MAX_VALUE)).to.throw()
        expect(() => CA.f(Infinity)).to.throw()
        expect(() => CA.f()).to.throw()
        expect(() => CA.f(false)).to.throw()
      }
      test(CA)
      const CA2 = await run.load(CA.location)
      test(CA2)
      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('updates local bindings only on deploy', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      const CA = run.deploy(A)
      CA.f()
      await CA.sync()
      expect(A.location).to.equal(CA.origin)
      expect(A.nonce).to.equal(1)
    })
  })

  // --------------------------------------------------------------------------
  // Standalone
  // --------------------------------------------------------------------------

  describe('Standalone', () => {
    it('code is code', () => {
      new Run() // eslint-disable-line
      expect(Code instanceof Code).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('can reference Code inside Jig', async () => {
      const run = new Run()
      class A extends Jig { static f () { return this instanceof Code } }
      A.deps = { Code }

      expectTx({
        nin: 0,
        nref: 2,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                deps: {
                  Code: { $jig: 0 },
                  Jig: { $jig: 1 }
                }
              }
            ]
          }
        ]
      })

      function test (CA) {
        expect(CA.f()).to.equal(true)
        expect(CA.deps.Code).to.equal(Code)
      }

      const CA = run.deploy(A)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('can store Code on jig', async () => {
      const run = new Run()
      class A extends Jig { f (x) { this.x = x } }
      const a = new A()
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
              'f',
              [{ $jig: 1 }]
            ]
          }
        ]
      })

      a.f(Code)
      await a.sync()

      const state = await run.cache.get('jig://' + a.location)
      expect(state.props.x).to.deep.equal({ $jig: 'native://Code' })

      function test (a) { expect(a.x).to.equal(Code) }
      test(a)

      const a2 = await run.load(a.location)
      test(a2)

      run.cache = new LocalCache()
      const a3 = await run.load(a.location)
      test(a3)
    })

    // ------------------------------------------------------------------------

    it('can store Code as class property', async () => {
      const run = new Run()
      class A extends Jig { }
      A.C = Code
      run.deploy(A)
      await run.sync()
      expect(A.C).to.equal(Code)
      const state = await run.cache.get('jig://' + A.location)
      expect(state.props.C).to.deep.equal({ $jig: 'native://Code' })
    })

    // ------------------------------------------------------------------------

    it('instanceof matches code parameters', () => {
      const run = new Run()
      function f (x) { return x instanceof C } // eslint-disable-line
      f.deps = { C: Code }
      const cf = run.deploy(f)
      expect(cf(run.deploy(class A { }))).to.equal(true)
      expect(cf(cf)).to.equal(true)
      expect(cf(class A { })).to.equal(false)
      expect(cf()).to.equal(false)
      expect(cf(null)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('throws if instantiate', () => {
      const run = new Run()
      function f () { return new Code() }
      f.deps = { Code }
      class A extends Jig { f () { return new Code() } }
      A.deps = { Code }
      const cf = run.deploy(f)
      const a = new A()
      expect(() => cf()).to.throw('Cannot instantiate Code')
      expect(() => a.f()).to.throw('Cannot instantiate Code')
    })

    // ------------------------------------------------------------------------

    it('cannot fake instance using setPrototypeOf', () => {
      const run = new Run()
      function f () {
        const o = { }
        Object.setPrototypeOf(o, Code.prototype)
        return o instanceof Code
      }
      f.deps = { Code }
      const cf = run.deploy(f)
      expect(cf()).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('arbitrary object using code is ok', async () => {
      const run = new Run()
      class A extends Jig {
        init () {
          this.o = { }
          Object.setPrototypeOf(this.o, Code.prototype)
        }
      }
      A.deps = { Code }
      const a = new A()
      await run.sync()
      const state = await run.cache.get('jig://' + a.location)
      expect(state.props.o.$arb).to.deep.equal({})
      expect(state.props.o.T).to.deep.equal({ $jig: 'native://Code' })
    })

    // ------------------------------------------------------------------------

    it('apply allowed code methods directly', async () => {
      const run = new Run()
      class A extends Jig {
        static auth2 () { return Code.prototype.auth.apply(this) }
        static destroy2 () { return Code.prototype.destroy.apply(this) }
      }
      A.deps = { Code }
      const CA = run.deploy(A)
      CA.auth2()
      CA.destroy2()
      await CA.sync()

      function test (CA) {
        expect(CA.nonce).to.equal(3)
        expect(CA.location.endsWith('_d0')).to.equal(true)
      }
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if apply illegal code methods directly', () => {
      const run = new Run()
      class A extends Jig {
        static upgrade2 () { Code.prototype.upgrade.apply(this, [class B { }]) }
      }
      A.deps = { Code }
      const CA = run.deploy(A)
      expect(() => CA.upgrade2()).to.throw('upgrade unavailable')
    })

    // ------------------------------------------------------------------------

    it('code methods are the same', () => {
      const run = new Run()

      expect(Code.auth).to.equal(Code.prototype.auth)

      function f () { return f.upgrade === Code.upgrade }
      f.deps = { Code }
      const cf = run.deploy(f)
      expect(cf()).to.equal(true)

      function g () { return g.upgrade === Code.prototype.upgrade }
      g.deps = { Code }
      const cg = run.deploy(g)
      expect(cg()).to.equal(true)

      expect(cf.upgrade).to.equal(Code.upgrade)
      expect(cf.upgrade).to.equal(Code.prototype.upgrade)
    })

    // ------------------------------------------------------------------------

    it('throws if deploy direct extension', async () => {
      const run = new Run()
      class A extends Code { }
      expect(() => run.deploy(A)).to.throw('Code is sealed')
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade direct extension', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B extends Code { }
      expect(() => CA.upgrade(B)).to.throw('Code is sealed')
    })
  })
})

// ------------------------------------------------------------------------------------------------
