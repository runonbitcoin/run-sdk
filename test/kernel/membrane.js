/**
 * membrane.js
 *
 * Tests for lib/kernel/membrane.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Code, Berry } = Run
const unmangle = require('../env/unmangle')
const { testRecord } = require('../env/misc')
const { mangle } = unmangle
const Proxy2 = unmangle(unmangle(Run)._Proxy2)
const {
  _Membrane: Membrane, _Rules: Rules, _sudo, _Sandbox, _EDITORS, _RESERVED_PROPS,
  _RESERVED_CODE_PROPS, _RESERVED_JIG_PROPS
} = unmangle(Run)
const { _CODE, _JIGS } = unmangle(unmangle(Run)._misc)
const SI = unmangle(_Sandbox)._intrinsics

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const DUMMY_OWNER = '1NbnqkQJSH86yx4giugZMDPJr2Ss2djt3N'
const DUMMY_TXID1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const DUMMY_TXID2 = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

// Reads and updates must happen in action to be recorded. This simulates one for ease of testing.
function simulateAction (f) {
  const Record = unmangle(unmangle(Run)._Record)
  const CURRENT_RECORD = unmangle(Record._CURRENT_RECORD)
  const jig = makeJig({})
  let ret
  try {
    CURRENT_RECORD._stack.push(jig)
    ret = f()
  } finally {
    CURRENT_RECORD._stack.pop()
  }
  const action = mangle({ _jig: jig })
  CURRENT_RECORD._action(action)
  return ret
}

// ------------------------------------------------------------------------------------------------

function makeJig (x, options = {}) {
  options = mangle(Object.assign(options, { _admin: true }))

  const jig = new Membrane(x, options)

  _sudo(() => {
    jig.location = `${DUMMY_TXID1}_d${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`
    jig.origin = `${DUMMY_TXID2}_o${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`
    jig.nonce = 0
    jig.owner = undefined
    jig.satoshis = undefined
  })

  _JIGS.add(jig)

  return jig
}

// ------------------------------------------------------------------------------------------------

function makeCode (x, options = {}) {
  options = mangle(Object.assign(options, { _admin: true }))

  const C = new Membrane(x, options)

  _sudo(() => {
    C.location = `${DUMMY_TXID1}_d${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`
    C.origin = `${DUMMY_TXID2}_o${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`
    C.nonce = 0
    C.owner = undefined
    C.satoshis = undefined
  })

  x.prototype.constructor = C

  const makeMethod = (method, C) => new Membrane(method, unmangle(Rules)._childProperty(C, true))

  Object.getOwnPropertyNames(x.prototype)
    .filter(name => name !== 'constructor')
    .forEach(name => { x.prototype[name] = makeMethod(x.prototype[name], C) })

  _CODE.add(C)

  const editor = mangle({
    _deploy: () => { },
    _postinstall: () => { },
    _installed: true,
    _src: x.toString()
  })

  _EDITORS.set(C, editor)

  return C
}

// ------------------------------------------------------------------------------------------------
// Membrane
// ------------------------------------------------------------------------------------------------

describe('Membrane', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates proxy', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(Proxy2._getTarget(A2)).to.equal(A)
    })

    it('assigns rules', () => {
      const rules = new Rules()
      const A = new Membrane(class A { }, rules)
      expect(unmangle(Proxy2._getHandler(A))._rules).to.equal(rules)
    })
  })

  // --------------------------------------------------------------------------
  // Base Handlers
  // --------------------------------------------------------------------------

  // Tests for the base handler when there are no other configurations
  describe('Base Handlers', () => {
    it('apply', () => {
      function f (x) { return x }
      const f2 = new Membrane(f)
      expect(f2(1)).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('construct', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(new A2() instanceof A2).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('defineProperty', () => {
      const m = new Membrane(class A { })
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      Object.defineProperty(m, 'n', desc)
      expect('n' in m).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('defineProperty disabled on methods', () => {
      const A = makeCode(class A { f () { } })
      const a = makeJig(new A())
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(a.f, 'n', desc)).to.throw('Cannot define n: immutable')
    })

    // ------------------------------------------------------------------------

    it('defineProperty with partial descriptor throws', () => {
      const o = makeJig({})
      o.n = 1
      const error = 'Descriptor must be configurable'
      expect(() => Object.defineProperty(o, 'n', { value: 2 })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('define __proto__ throws', () => {
      const a = makeJig({ })
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(a, '__proto__', desc)).to.throw('define __proto__ disabled')
    })

    // ------------------------------------------------------------------------

    it('delete', () => {
      class A { }
      A.n = 1
      const A2 = new Membrane(A)
      delete A2.n
      expect('n' in A2).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('delete does not delete prototype properties', () => {
      class A { f () { } }
      const a = new Membrane(new A())
      delete a.f
      expect('f' in a).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('delete __proto__ throws', () => {
      class A { f () { } }
      const a = new Membrane(new A())
      // eslint-disable-next-line
      expect(() => { delete a.__proto__ }).to.throw('delete __proto__ disabled')
    })

    // ------------------------------------------------------------------------

    it('get', () => {
      class A { }
      A.n = 1
      const A2 = new Membrane(A)
      expect(A2.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('get object wrapped', () => {
      class A { }
      A.o = { }
      const A2 = new Membrane(A)
      expect(A2.o).not.to.equal(A.o)
      expect(Proxy2._getTarget(A2.o)).to.equal(A.o)
    })

    // ------------------------------------------------------------------------

    it('get inner object wrapped once', () => {
      class A { }
      A.o = { }
      A.p = { o: A.o }
      const A2 = new Membrane(A)
      expect(A2.p.o).not.to.equal(A.o)
      expect(Proxy2._getTarget(A2.p.o)).to.equal(A.o)
    })

    // ------------------------------------------------------------------------

    it('get prototype property', () => {
      class A { f () { } }
      const a = new Membrane(new A())
      expect(typeof a.f).to.equal('function')
    })

    // ------------------------------------------------------------------------

    it('get intrinsic class not wrapped', () => {
      const s = new Membrane(new Set())
      expect(s.constructor).to.equal(Set)
    })

    // ------------------------------------------------------------------------

    it('get static method on child class', () => {
      class A { static f () { } }
      const A2 = new Membrane(A)
      class B extends A2 { }
      const B2 = new Membrane(B)
      expect(typeof A2.f).to.equal('function')
      expect(typeof B2.f).to.equal('function')
      expect(A2.f).to.equal(B2.f)
    })

    // ------------------------------------------------------------------------

    it('get returns creations directly', () => {
      const jig = makeJig({})
      class A { }
      A.jig = jig
      const A2 = makeCode(A)
      expect(A2.jig).to.equal(jig)
    })

    // ------------------------------------------------------------------------

    it('get returns prototype directly', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(A2.prototype).to.equal(A.prototype)
    })

    // ------------------------------------------------------------------------

    // Symbol props return directly because they are special and set only by Run.
    it('get returns symbol props directly', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(A2[Symbol.hasInstance]).to.equal(A[Symbol.hasInstance])
    })

    // ------------------------------------------------------------------------

    it('get returns constructor directly', () => {
      const o = {}
      const o2 = new Membrane(o)
      expect(o2.constructor).to.equal(o.constructor)
    })

    // ------------------------------------------------------------------------

    it('get an intrinsic property', () => {
      const A = new Membrane(class A { })
      expect(A.toString).to.equal(Function.prototype.toString)
      const B = new Membrane([])
      expect(B.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('get returns the same method every time', () => {
      class A {
        f () { }
        static g () { }
      }
      const A2 = new Membrane(A)
      const a = new Membrane(new A2())
      expect(a.f).to.equal(a.f)
      expect(A2.g).to.equal(A2.g)
    })

    // ------------------------------------------------------------------------

    it('get __proto__ returns prototype', () => {
      const a = new Membrane(class A { })
      // eslint-disable-next-line
      expect(a.__proto__).to.equal(Object.getPrototypeOf(a))
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor', () => {
      class A { }
      A.n = 1
      const A2 = new Membrane(A)
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(Object.getOwnPropertyDescriptor(A2, 'n')).to.deep.equal(desc)
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor returns creations directly', () => {
      const jig = makeJig({})
      class A { }
      A.jig = jig
      const A2 = new Membrane(A)
      expect(Object.getOwnPropertyDescriptor(A2, 'jig').value).to.equal(jig)
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor returns prototype directly', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(Object.getOwnPropertyDescriptor(A2, 'prototype').value).to.equal(A.prototype)
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor for __proto__ returns undefined', () => {
      const a = new Membrane({ })
      expect(Object.getOwnPropertyDescriptor(a, '__proto__')).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('getPrototypeOf class', () => {
      class B { }
      class A extends B { }
      const A2 = new Membrane(A)
      expect(Object.getPrototypeOf(A2)).to.equal(B)
    })

    // ------------------------------------------------------------------------

    it('getPrototypeOf instance', () => {
      class A { }
      const a = new Membrane(new A())
      expect(Object.getPrototypeOf(a)).to.equal(A.prototype)
    })

    // ------------------------------------------------------------------------

    it('has', () => {
      class A { }
      A.n = 1
      const A2 = new Membrane(A)
      expect('n' in A2).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('isExtensible', () => {
      const m = new Membrane(class A { })
      expect(Object.isExtensible(m)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('ownKeys', () => {
      class A { }
      A.n = 1
      A[0] = 2
      A[1] = 3
      A[10] = 4
      A[2] = 5
      const A2 = new Membrane(A)
      const keys = ['0', '1', '2', '10', 'length', 'n', 'name', 'prototype']
      expect(Reflect.ownKeys(A2)).to.deep.equal(keys)
    })

    // ------------------------------------------------------------------------

    it('preventExtensions disabled', () => {
      const m = new Membrane(class A { })
      expect(() => Object.preventExtensions(m)).to.throw('preventExtensions disabled')
    })

    // ------------------------------------------------------------------------

    it('set', () => {
      const m = new Membrane(class A { })
      m.n = 1
      expect(m.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('set removes membrane for owned wrapped objects', () => {
      const a = {}
      const a2 = new Membrane(a)
      const b = {}
      const b2 = new Membrane(b, mangle({ _creation: a2 }))
      a2.b = b2
      expect(a.b).to.equal(b)
    })

    // ------------------------------------------------------------------------

    it('set clones for unowned wrapped objects', () => {
      const a = {}
      const a2 = new Membrane(a)
      const b = {}
      const b2 = new Membrane(b, { _creation: makeCode(class A { }) })
      a2.b = b2
      expect(a.b).to.deep.equal(b)
      expect(Proxy2._getTarget(a.b)).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('set multiple times', () => {
      const m = new Membrane(class A { })
      m.n = 1
      m.n = 2
      m.n = 3
      expect(m.n).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('set on non-membrane child class', () => {
      const A = new Membrane(class A { })
      class B extends A { }
      B.n = 1
      expect(B.n).to.equal(1)
      expect(A.n).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('set disabled on methods', () => {
      const A = makeCode(class A { f () { } })
      const a = makeJig(new A())
      expect(() => { a.f.n = 1 }).to.throw('Cannot set n: immutable')
    })

    // ------------------------------------------------------------------------

    it('set __proto__ disabled', () => {
      const a = new Membrane(class A { })
      // eslint-disable-next-line
      expect(() => { a.__proto__ = {} }).to.throw('set __proto__ disabled')
    })

    // ------------------------------------------------------------------------

    it('set new with prototype', () => {
      const b = {}
      const a = {}
      Object.setPrototypeOf(a, b)
      const a2 = new Membrane(a)
      a2.n = 1
      expect(a.n).to.equal(1)
      expect(typeof b.n).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('set existing with prototype', () => {
      const b = { n: 1 }
      const a = {}
      Object.setPrototypeOf(a, b)
      const a2 = new Membrane(a)
      a2.n = 2
      expect(a.n).to.equal(2)
      expect(b.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('setPrototypeOf disabled for class', () => {
      class A { }
      const A2 = new Membrane(A)
      expect(() => Object.setPrototypeOf(A2, class B { })).to.throw('setPrototypeOf disabled')
    })

    // ------------------------------------------------------------------------

    it('setPrototypeOf disabled for instance', () => {
      class A { }
      const a = new Membrane(new A())
      expect(() => Object.setPrototypeOf(a, {})).to.throw('setPrototypeOf disabled')
    })

    // ------------------------------------------------------------------------

    it('intrinsicRead', () => {
      const m = new Membrane(new Map([[1, 2]]))
      expect(m.get(1)).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('intrinsicUpdate', () => {
      const m = new Membrane(new Map())
      m.set(1, 2)
    })

    // ------------------------------------------------------------------------

    it('intrinsicIn removes membrane for owned wrapped objects', () => {
      const A = makeCode(class A {})
      const o = {}
      const o2 = new Membrane(o, mangle({ _creation: A }))
      const s = new Set()
      const s2 = new Membrane(s, mangle({ _creation: A }))
      s2.add(o2)
      expect(s.has(o)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('intrinsicIn keeps membrane for creations', () => {
      const jig = makeJig({})
      const s = new Set()
      const s2 = new Membrane(s)
      s2.add(jig)
      expect(s.has(jig)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('intrinsicOut adds membrane for objects', () => {
      const o = {}
      const m2 = new Membrane(new Map())
      m2.set(1, o)
      expect(m2.get(1)).not.to.equal(o)
    })

    // ------------------------------------------------------------------------

    it('intrinsicOut keeps membrane for creations', () => {
      const jig = makeJig({})
      const m2 = new Membrane(new Map())
      m2.set(1, jig)
      expect(m2.get(1)).to.equal(jig)
    })

    // ------------------------------------------------------------------------

    it('intrinsicOut does not add membrane for basic types', () => {
      const m2 = new Membrane(new Map())
      m2.set(1, null)
      m2.set(2, 'abc')
      m2.set(3, false)
      expect(m2.get(1)).to.equal(null)
      expect(m2.get(2)).to.equal('abc')
      expect(m2.get(3)).to.equal(false)
    })
  })

  // --------------------------------------------------------------------------
  // Admin
  // --------------------------------------------------------------------------

  describe('Admin', () => {
    it('admin mode runs directly on target', () => {
      class A { }
      const A2 = new Membrane(A, mangle({ _admin: true }))
      function f () { return f }
      const f2 = new Membrane(f, mangle({ _admin: true }))
      expect(_sudo(() => new A2()) instanceof A).to.equal(true)
      expect(_sudo(() => f2())).to.equal(f)
      _sudo(() => Object.defineProperty(A2, 'n', { value: 1, configurable: true }))
      expect(A.n).to.equal(1)
      _sudo(() => { delete A2.n })
      expect('n' in A).to.equal(false)
      A.n = 2
      expect(_sudo(() => Object.getOwnPropertyDescriptor(A2, 'n')).value).to.equal(2)
      expect(_sudo(() => Object.getPrototypeOf(A2))).to.equal(Object.getPrototypeOf(A))
      expect(_sudo(() => 'n' in A2)).to.equal(true)
      expect(_sudo(() => Object.isExtensible(A2))).to.equal(Object.isExtensible(A))
      A._privacy = 1
      const keys = _sudo(() => Object.getOwnPropertyNames(A2))
      const expectedKeys = ['length', 'prototype', 'name', 'n', '_privacy']
      // Check that each key is present, but in admin mode, ordering is not guaranteed
      expect(keys.length).to.equal(expectedKeys.length)
      expect(keys.some(key => !expectedKeys.includes(key))).to.equal(false)
      _sudo(() => Object.preventExtensions(A2))
      expect(Object.isExtensible(A)).to.equal(false)
      _sudo(() => { f2.n = 1 })
      expect(f.n).to.equal(1)
      function g () { }
      _sudo(() => Object.setPrototypeOf(f2, g))
      expect(Object.getPrototypeOf(f)).to.equal(g)
      const m = new Map()
      const o = {}
      const m2 = new Membrane(m, mangle({ _admin: true, _creation: f }))
      const mset = m2.set
      const mhas = m2.has
      const mget = m2.get
      expect(_sudo(() => m2.set(o, 2))).to.equal(m2)
      expect(_sudo(() => mset.call(m2, o, 3))).to.equal(m2)
      expect(_sudo(() => mhas.call(m2, o))).to.equal(true)
      expect(_sudo(() => mget.call(m2, o))).to.equal(3)
      expect(_sudo(() => m.has(o))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('admin mode overrides errors', () => {
      const f = new Membrane(function f () { }, mangle({ _admin: true }))
      _sudo(() => { f.location = 'error://hello' })
      expect(_sudo(() => f.location)).to.equal('error://hello')
    })
  })

  // --------------------------------------------------------------------------
  // Errors
  // --------------------------------------------------------------------------

  describe('Errors', () => {
    it('throws if use jig that has errors', () => {
      const A = new Membrane(class A { })
      const f = new Membrane(function f () {})
      const m = new Membrane(new Map(), mangle({ _creation: A }))

      const mset = m.set
      const mclear = m.clear
      const mget = m.get
      const mhas = m.has

      const error = 'hello'
      A.location = `error://${error}`
      f.location = `error://${error}`

      expect(() => new A()).to.throw()
      expect(() => f()).to.throw(error)
      expect(() => Object.defineProperty(A, 'n', { value: 1 })).to.throw(error)
      expect(() => { delete f.x }).to.throw(error)
      expect(() => A.x).to.throw(error)
      expect(() => Object.getOwnPropertyDescriptor(f, 'n')).to.throw(error)
      expect(() => Object.getPrototypeOf(A)).to.throw(error)
      expect(() => Object.isExtensible(f)).to.throw(error)
      expect(() => Object.getOwnPropertyNames(A)).to.throw(error)
      expect(() => Object.preventExtensions(f)).to.throw(error)
      expect(() => { A.n = 1 }).to.throw(error)
      expect(() => Object.setPrototypeOf(f, {})).to.throw(error)

      expect(() => m.set).to.throw(error)
      expect(() => mset.call(m, 1, 2)).to.throw(error)
      expect(() => mclear.call(m)).to.throw(error)
      expect(() => mget.call(m, 1)).to.throw(error)
      expect(() => mhas.call(m, 1)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if inner objects has errors', () => {
      const jig = new Membrane(class A { })
      jig.location = 'error://hello'
      const o = new Membrane({}, mangle({ _creation: jig }))
      expect(() => o.n).to.throw('hello')
    })

    // ------------------------------------------------------------------------

    it('cannot swallow inner errors', () => {
      const options = { _recordableTarget: true, _recordCalls: true, _locationBindings: true }
      class A {
        static f () {
          try { this.location = '123' } catch (e) { }
        }
      }
      const A2 = makeCode(A, options)
      expect(() => testRecord(() => A2.f())).to.throw('Cannot set location')
    })

    // ------------------------------------------------------------------------

    it('cannot swallow errors from another jig', () => {
      const M = makeCode(class C { })
      const options = { _creation: M, _recordableTarget: true, _recordCalls: true, _locationBindings: true }
      class A { static g () { } }
      A.location = 'error://abc'
      class B { static f (A2) { A2.g() } }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      testRecord(() => B2.f(A2))
    })
  })

  // --------------------------------------------------------------------------
  // Code methods
  // --------------------------------------------------------------------------

  describe('Code methods', () => {
    it('has', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      expect('sync' in f).to.equal(true)
      expect('upgrade' in f).to.equal(true)
      expect('destroy' in f).to.equal(true)
      expect('auth' in f).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('get', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      expect(f.sync).to.equal(Code.prototype.sync)
      expect(f.upgrade).to.equal(Code.prototype.upgrade)
      expect(f.destroy).to.equal(Code.prototype.destroy)
      expect(f.auth).to.equal(Code.prototype.auth)
    })

    // ------------------------------------------------------------------------

    // Because these methods are not owned by the creations
    it('getOwnPropertyDescriptor undefined', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      expect(Object.getOwnPropertyDescriptor(f, 'sync')).to.equal(undefined)
      expect(Object.getOwnPropertyDescriptor(f, 'upgrade')).to.equal(undefined)
      expect(Object.getOwnPropertyDescriptor(f, 'destroy')).to.equal(undefined)
      expect(Object.getOwnPropertyDescriptor(f, 'auth')).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('cannot set', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      expect(() => { f.sync = 1 }).to.throw('Cannot set sync')
      expect(() => { f.upgrade = 1 }).to.throw('Cannot set upgrade')
      expect(() => { f.destroy = 1 }).to.throw('Cannot set destroy')
      expect(() => { f.auth = 1 }).to.throw('Cannot set auth')
    })

    // ------------------------------------------------------------------------

    it('cannot define', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(f, 'sync', desc)).to.throw('Cannot define sync')
      expect(() => Object.defineProperty(f, 'upgrade', desc)).to.throw('Cannot define upgrade')
      expect(() => Object.defineProperty(f, 'destroy', desc)).to.throw('Cannot define destroy')
      expect(() => Object.defineProperty(f, 'auth', desc)).to.throw('Cannot define auth')
    })

    // ------------------------------------------------------------------------

    it('cannot delete', () => {
      const f = new Membrane(function f () { }, mangle({ _codeProps: true }))
      expect(() => { delete f.sync }).to.throw('Cannot delete sync')
      expect(() => { delete f.upgrade }).to.throw('Cannot delete upgrade')
      expect(() => { delete f.destroy }).to.throw('Cannot delete destroy')
      expect(() => { delete f.auth }).to.throw('Cannot delete auth')
    })
  })

  // --------------------------------------------------------------------------
  // Code options
  // --------------------------------------------------------------------------

  describe('Code options', () => {
    it('set options', () => {
      class A { static f (k, v) { this[k] = v } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _codeProps: true })
      testRecord(() => CA.f('sealed', true))
      testRecord(() => CA.f('sealed', false))
      testRecord(() => CA.f('sealed', 'owner'))
      testRecord(() => CA.f('upgradable', true))
      testRecord(() => CA.f('upgradable', false))
      testRecord(() => CA.f('interactive', true))
      testRecord(() => CA.f('interactive', false))
    })

    // ------------------------------------------------------------------------

    it('define options', () => {
      class A { static f (k, v) { Object.defineProperty(this, k, { configurable: true, enumerable: true, writable: true, value: v }) } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _codeProps: true })
      testRecord(() => CA.f('sealed', true))
      testRecord(() => CA.f('sealed', false))
      testRecord(() => CA.f('sealed', 'owner'))
      testRecord(() => CA.f('upgradable', true))
      testRecord(() => CA.f('upgradable', false))
      testRecord(() => CA.f('interactive', true))
      testRecord(() => CA.f('interactive', false))
    })

    // ------------------------------------------------------------------------

    it('delete options', () => {
      class A { static f (k) { delete this[k] } }
      A.sealed = true
      A.upgradable = true
      A.interactive = true
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _codeProps: true })
      testRecord(() => CA.f('sealed'))
      testRecord(() => CA.f('upgradable'))
      testRecord(() => CA.f('interactive'))
    })

    // ------------------------------------------------------------------------

    it('throws if set invalid options', () => {
      class A { static f (k, v) { this[k] = v } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _codeProps: true })
      expect(() => testRecord(() => CA.f('sealed', undefined))).to.throw('Invalid sealed option: undefined')
      expect(() => testRecord(() => CA.f('sealed', null))).to.throw('Invalid sealed option: null')
      expect(() => testRecord(() => CA.f('sealed', 'false'))).to.throw('Invalid sealed option: false')
      expect(() => testRecord(() => CA.f('sealed', ''))).to.throw('Invalid sealed option: ')
      expect(() => testRecord(() => CA.f('sealed', 1))).to.throw('Invalid sealed option: 1')
      expect(() => testRecord(() => CA.f('upgradable', undefined))).to.throw('Invalid upgradable option: undefined')
      expect(() => testRecord(() => CA.f('upgradable', 'owner'))).to.throw('Invalid upgradable option: owner')
      expect(() => testRecord(() => CA.f('interactive', null))).to.throw('Invalid interactive option: null')
      expect(() => testRecord(() => CA.f('interactive', undefined))).to.throw('Invalid interactive option: undefined')
      expect(() => testRecord(() => CA.f('interactive', 1))).to.throw('Invalid interactive option: 1')
    })

    // ------------------------------------------------------------------------

    it('throws if define invalid options', () => {
      class A { static f (k, v) { Object.defineProperty(this, k, { configurable: true, enumerable: true, writable: true, value: v }) } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _codeProps: true })
      expect(() => testRecord(() => CA.f('sealed', undefined))).to.throw('Invalid sealed option: undefined')
      expect(() => testRecord(() => CA.f('sealed', null))).to.throw('Invalid sealed option: null')
      expect(() => testRecord(() => CA.f('sealed', 'false'))).to.throw('Invalid sealed option: false')
      expect(() => testRecord(() => CA.f('sealed', ''))).to.throw('Invalid sealed option: ')
      expect(() => testRecord(() => CA.f('sealed', 1))).to.throw('Invalid sealed option: 1')
      expect(() => testRecord(() => CA.f('upgradable', undefined))).to.throw('Invalid upgradable option: undefined')
      expect(() => testRecord(() => CA.f('upgradable', 'owner'))).to.throw('Invalid upgradable option: owner')
      expect(() => testRecord(() => CA.f('interactive', 0))).to.throw('Invalid interactive option: 0')
      expect(() => testRecord(() => CA.f('interactive', 'false'))).to.throw('Invalid interactive option: false')
    })
  })

  // --------------------------------------------------------------------------
  // Jig methods
  // --------------------------------------------------------------------------

  describe('Jig methods', () => {
    it('has', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      expect('sync' in a).to.equal(true)
      expect('destroy' in a).to.equal(true)
      expect('auth' in a).to.equal(true)
      expect('init' in a).to.equal(true)
      expect('toString' in a).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('get', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      expect(a.sync).to.equal(Jig.prototype.sync)
      expect(a.destroy).to.equal(Jig.prototype.destroy)
      expect(a.auth).to.equal(Jig.prototype.auth)
      expect(a.init).to.equal(Jig.prototype.init)
      expect(a.toString).to.equal(Jig.prototype.toString)
    })

    // ------------------------------------------------------------------------

    // Because these methods are not owned by the jig itself
    it('getOwnPropertyDescriptor undefined', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      expect(Object.getOwnPropertyDescriptor(a, 'sync')).to.equal(undefined)
      expect(Object.getOwnPropertyDescriptor(a, 'init')).to.equal(undefined)
      expect(Object.getOwnPropertyDescriptor(a, 'tostring')).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('cannot set', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      expect(() => { a.sync = 1 }).to.throw('Cannot set sync')
      expect(() => { a.init = 1 }).to.throw('Cannot set init')
    })

    // ------------------------------------------------------------------------

    it('cannot define', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(a, 'sync', desc)).to.throw('Cannot define sync')
      expect(() => Object.defineProperty(a, 'init', desc)).to.throw('Cannot define init')
    })

    // ------------------------------------------------------------------------

    it('cannot delete', () => {
      const a = new Membrane({}, mangle({ _admin: true, _jigProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Jig { }).prototype))
      expect(() => { delete a.sync }).to.throw('Cannot delete sync')
      expect(() => { delete a.init }).to.throw('Cannot delete init')
    })
  })

  // --------------------------------------------------------------------------
  // Berry methods
  // --------------------------------------------------------------------------

  describe('Berry methods', () => {
    it('has', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      expect('init' in a).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('get', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      expect(a.init).to.equal(Berry.prototype.init)
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor undefined', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      expect(Object.getOwnPropertyDescriptor(a, 'init')).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('cannot set', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      expect(() => { a.init = 1 }).to.throw('Cannot set init')
    })

    // ------------------------------------------------------------------------

    it('cannot define', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(a, 'init', desc)).to.throw('Cannot define init')
    })

    // ------------------------------------------------------------------------

    it('cannot delete', () => {
      const a = new Membrane({}, mangle({ _admin: true, _berryProps: true }))
      _sudo(() => Object.setPrototypeOf(a, (class A extends Berry { }).prototype))
      expect(() => { delete a.init }).to.throw('Cannot delete init')
    })
  })

  // --------------------------------------------------------------------------
  // Location bindings
  // --------------------------------------------------------------------------

  describe('Location bindings', () => {
    it('read location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = `${DUMMY_TXID1}_o1` })
      _sudo(() => { A.origin = `${DUMMY_TXID2}_o2` })
      _sudo(() => { A.nonce = 1 })
      expect(A.location).to.equal(`${DUMMY_TXID1}_o1`)
      expect(A.origin).to.equal(`${DUMMY_TXID2}_o2`)
      expect(A.nonce).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('read native bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = 'native://A' })
      _sudo(() => { A.origin = 'native://A' })
      expect(A.location).to.equal('native://A')
      expect(A.origin).to.equal('native://A')
    })

    // ------------------------------------------------------------------------

    it('throws if read undetermined location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = '_o1' })
      _sudo(() => { A.origin = `record://${DUMMY_TXID2}_d2` })
      expect(() => A.location).to.throw('Cannot read location')
      expect(() => A.origin).to.throw('Cannot read origin')
      expect(() => A.nonce).to.throw('Cannot read nonce')
    })

    // ------------------------------------------------------------------------

    it('set inner object location binding props', () => {
      const jig = new Membrane(class A { }, mangle({ _locationBindings: true }))
      const o = new Membrane({}, mangle({ _creation: jig }))
      o.location = 'abc_o1'
      o.nonce = 'bad nonce'
    })

    // ------------------------------------------------------------------------

    it('throws if set location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _locationBindings: true }))
      expect(() => { A.location = 'abc_o1' }).to.throw('Cannot set location')
      expect(() => { A.origin = 'def_d2' }).to.throw('Cannot set origin')
      expect(() => { A.nonce = 1 }).to.throw('Cannot set nonce')
    })

    // ------------------------------------------------------------------------

    it('cannot delete location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _locationBindings: true }))
      expect(() => { delete A.location }).to.throw('Cannot delete location')
      expect(() => { delete A.origin }).to.throw('Cannot delete origin')
      expect(() => { delete A.nonce }).to.throw('Cannot delete nonce')
    })

    // ------------------------------------------------------------------------

    it('can delete inner object location bindings', () => {
      const jig = new Membrane(class A { }, mangle({ _locationBindings: true }))
      const o = new Membrane({}, mangle({ _creation: jig }))
      delete o.location
      delete o.origin
      delete o.nonce
    })

    // ------------------------------------------------------------------------

    it('get descriptor for location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = `${DUMMY_TXID1}_o1` })
      _sudo(() => { A.origin = `${DUMMY_TXID2}_o2` })
      _sudo(() => { A.nonce = 1 })
      expect(Object.getOwnPropertyDescriptor(A, 'location').value).to.equal(`${DUMMY_TXID1}_o1`)
      expect(Object.getOwnPropertyDescriptor(A, 'origin').value).to.equal(`${DUMMY_TXID2}_o2`)
      expect(Object.getOwnPropertyDescriptor(A, 'nonce').value).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('get descriptor for location bindings on inner objects', () => {
      const jig = new Membrane(class A { }, mangle({ _locationBindings: true }))
      const o = new Membrane({}, mangle({ _admin: true, _creation: jig }))
      _sudo(() => { o.location = [] })
      _sudo(() => { o.origin = null })
      _sudo(() => { o.nonce = new Set() })
      expect(Object.getOwnPropertyDescriptor(o, 'location').value).to.deep.equal([])
      expect(Object.getOwnPropertyDescriptor(o, 'origin').value).to.equal(null)
      expect(Object.getOwnPropertyDescriptor(o, 'nonce').value).to.deep.equal(new Set())
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor of undetermined location bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = '_o1' })
      _sudo(() => { A.origin = `record://${DUMMY_TXID1}_d2` })
      expect(() => Object.getOwnPropertyDescriptor(A, 'location').value).to.throw('Cannot read location')
      expect(() => Object.getOwnPropertyDescriptor(A, 'origin').value).to.throw('Cannot read origin')
      expect(() => Object.getOwnPropertyDescriptor(A, 'nonce').value).to.throw('Cannot read nonce')
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor of partial berry location', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _locationBindings: true }))
      _sudo(() => { A.location = `${DUMMY_TXID1}_o1?berry=abc&version=5` })
      expect(() => Object.getOwnPropertyDescriptor(A, 'location').value).to.throw('Cannot read location')
      expect(() => Object.getOwnPropertyDescriptor(A, 'origin').value).to.throw('Cannot read origin')
      expect(() => Object.getOwnPropertyDescriptor(A, 'nonce').value).to.throw('Cannot read nonce')
    })
  })

  // --------------------------------------------------------------------------
  // Utxo bindings
  // --------------------------------------------------------------------------

  describe('Utxo bindings', () => {
    it('read utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _utxoBindings: true }))
      _sudo(() => { A.owner = DUMMY_OWNER })
      _sudo(() => { A.satoshis = 0 })
      expect(A.owner).to.equal(DUMMY_OWNER)
      expect(A.satoshis).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('throws if read undetermined utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _utxoBindings: true }))
      _sudo(() => { A.owner = undefined })
      _sudo(() => { A.satoshis = undefined })
      expect(() => A.owner).to.throw('Cannot read owner')
      expect(() => A.satoshis).to.throw('Cannot read satoshis')
    })

    // ------------------------------------------------------------------------

    it('set utxo bindings in method marks unbound', () => {
      class A {
        static f () { this.owner = DUMMY_OWNER }
        static g () { this.satoshis = 1 }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.owner = undefined })
      _sudo(() => { A2.satoshis = undefined })
      testRecord(record => {
        expect(unmangle(record._unbound)._size).to.equal(0)
        A2.f()
        expect(unmangle(record._unbound)._arr()[0]).to.equal(A2)
      })
      testRecord(record => {
        expect(unmangle(record._unbound)._size).to.equal(0)
        A2.g()
        expect(unmangle(record._unbound)._arr()[0]).to.equal(A2)
      })
    })

    // ------------------------------------------------------------------------

    it('marks unbound after leave last method', () => {
      class A {
        static f () {
          this.n = 1
          this.g()
          this.n = 2
        }

        static g () {
          this.owner = DUMMY_OWNER
        }

        static h () {
          this.n = 3
        }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      testRecord(record => {
        A2.f()
        expect(A2.n).to.equal(2)
        expect(unmangle(record._unbound)._arr()).to.deep.equal([A2])
        expect(() => A2.h()).to.throw('Cannot set n: unbound')
      })
    })

    // ------------------------------------------------------------------------

    it('marks unbound after leave last method to another jig', () => {
      class A {
        static f () {
          this.n = 1
          this.g()
          this.n = 2
        }

        static g () {
          this.owner = DUMMY_OWNER
        }

        static h () {
          this.m = 3
        }
      }
      class B {
        static i (A) {
          A.f()
          A.h()
        }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      const B2 = makeCode(B, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      expect(() => testRecord(record => B2.i(A2))).to.throw('Cannot set m: unbound')
    })

    // ------------------------------------------------------------------------

    it('marks unbound after leave last method to another jig then to self again', () => {
      class A {
        static f () {
          this.owner = DUMMY_OWNER
        }

        static h (B) {
          B.g(this)
          this.n = 1
        }
      }
      class B {
        static g (A) {
          A.f()
        }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      const B2 = makeCode(B, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      expect(() => testRecord(record => A2.h(B2))).to.throw('Cannot set n: unbound')
    })

    // ------------------------------------------------------------------------

    it('define utxo bindings in method makes them unbound', () => {
      const desc = { configurable: true, enumerable: true, writable: true }
      class A {
        static f () { Object.defineProperty(this, 'owner', Object.assign({ value: DUMMY_OWNER }, desc)) }
        static g () { Object.defineProperty(this, 'satoshis', Object.assign({ value: 1 }, desc)) }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.owner = undefined })
      _sudo(() => { A2.satoshis = undefined })
      testRecord(record => {
        expect(unmangle(record._unbound)._size).to.equal(0)
        A2.f()
        expect(unmangle(record._unbound)._arr()[0]).to.equal(A2)
      })
      testRecord(record => {
        expect(unmangle(record._unbound)._size).to.equal(0)
        A2.g()
        expect(unmangle(record._unbound)._arr()[0]).to.equal(A2)
      })
    })

    // ------------------------------------------------------------------------

    it('set owner when undetermined', () => {
      class A { static f () { this.owner = DUMMY_OWNER } }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.owner = undefined })
      testRecord(() => A2.f())
      expect(A2.owner).to.equal(DUMMY_OWNER)
    })

    // ------------------------------------------------------------------------

    it('set satoshis when undetermined', () => {
      class A { static f () { this.satoshis = 1 } }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.satoshis = undefined })
      testRecord(() => A2.f())
      expect(A2.satoshis).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('set inner object creation utxo properties', () => {
      const jig = new Membrane(class A { }, mangle({ _utxoBindings: true }))
      const o = new Membrane({}, mangle({ _creation: jig }))
      o.owner = DUMMY_OWNER
      o.satoshis = 123
    })

    // ------------------------------------------------------------------------

    it('throws if set invalid utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _utxoBindings: true }))
      expect(() => { A.owner = [] }).to.throw('Invalid owner')
      expect(() => { A.satoshis = null }).to.throw('satoshis must be a number')
    })

    // ------------------------------------------------------------------------

    it('throws if set while unbound owner', () => {
      class A {
        static f () { this.owner = DUMMY_OWNER }
        static g () { this.n = 1 }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.owner = undefined })
      _sudo(() => { A2.satoshis = undefined })
      expect(() => testRecord(record => {
        A2.f()
        A2.g()
      })).to.throw('Cannot set n')
    })

    // ------------------------------------------------------------------------

    it('throws if define while unbound satoshis', () => {
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      class A {
        static f () { this.satoshis = 1 }
        static g () { Object.defineProperty(this, 'n', desc) }
      }
      const A2 = makeCode(A, { _admin: true, _utxoBindings: true, _recordCalls: true, _recordableTarget: true })
      _sudo(() => { A2.owner = undefined })
      _sudo(() => { A2.satoshis = undefined })
      expect(() => testRecord(record => {
        A2.f()
        A2.g()
      })).to.throw('Cannot define n')
    })

    // ------------------------------------------------------------------------

    it('cannot delete utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _utxoBindings: true }))
      expect(() => { delete A.owner }).to.throw('Cannot delete owner')
      expect(() => { delete A.satoshis }).to.throw('Cannot delete satoshis')
    })

    // ------------------------------------------------------------------------

    it('can delete inner object utxo bindings', () => {
      const jig = new Membrane(class A { }, mangle({ _utxoBindings: true }))
      const o = new Membrane({}, mangle({ _creation: jig }))
      delete o.owner
      delete o.satoshis
    })

    // ------------------------------------------------------------------------

    it('get descriptor for utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _utxoBindings: true }))
      _sudo(() => { A.owner = DUMMY_OWNER })
      _sudo(() => { A.satoshis = 0 })
      expect(Object.getOwnPropertyDescriptor(A, 'owner').value).to.equal(DUMMY_OWNER)
      expect(Object.getOwnPropertyDescriptor(A, 'satoshis').value).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('get descriptor for utxo bindings on inner objects', () => {
      const jig = new Membrane(class A { }, mangle({ _utxoBindings: true }))
      const o = new Membrane({}, mangle({ _admin: true, _creation: jig }))
      _sudo(() => { o.owner = false })
      _sudo(() => { o.satoshis = -1000 })
      expect(Object.getOwnPropertyDescriptor(o, 'owner').value).to.equal(false)
      expect(Object.getOwnPropertyDescriptor(o, 'satoshis').value).to.equal(-1000)
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor of undetermined utxo bindings', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _utxoBindings: true }))
      _sudo(() => { A.owner = undefined })
      _sudo(() => { A.satoshis = undefined })
      expect(() => Object.getOwnPropertyDescriptor(A, 'owner').value).to.throw('Cannot read owner')
      expect(() => Object.getOwnPropertyDescriptor(A, 'satoshis').value).to.throw('Cannot read satoshis')
    })
  })

  // --------------------------------------------------------------------------
  // Immutable
  // --------------------------------------------------------------------------

  describe('Immutable', () => {
    it('defineProperty throws', () => {
      const o = new Membrane({ }, mangle({ _immutable: true }))
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(o, 'n', desc)).to.throw('Cannot define n: immutable')
    })

    // ------------------------------------------------------------------------

    it('delete disabled', () => {
      const A = new Membrane(class A { }, mangle({ _immutable: true }))
      expect(() => { delete A.n }).to.throw('Cannot delete n: immutable')
    })

    // ------------------------------------------------------------------------

    it('set disabled', () => {
      const o = new Membrane({ }, mangle({ _immutable: true }))
      expect(() => { o.n = 1 }).to.throw('Cannot set n: immutable')
    })

    // ------------------------------------------------------------------------

    it('get adds immutable membrane', () => {
      const A = new Membrane({ }, mangle({ _admin: true, _immutable: true }))
      _sudo(() => { A.o = {} })
      expect(A.o).not.to.equal(_sudo(() => A.o))
      expect(() => { A.o.n = 1 }).to.throw('Cannot set n: immutable')
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor adds immutable membrane', () => {
      const A = new Membrane({ }, mangle({ _admin: true, _immutable: true }))
      _sudo(() => { A.o = {} })
      const value1 = Object.getOwnPropertyDescriptor(A, 'o').value
      const value2 = _sudo(() => Object.getOwnPropertyDescriptor(A, 'o').value)
      expect(value1).not.to.equal(value2)
      expect(() => { value1.n = 1 }).to.throw('Cannot set n: immutable')
    })

    // ------------------------------------------------------------------------

    it('intrinsic out adds immutable membrane', () => {
      const A = new Membrane(new Map(), mangle({ _admin: true, _immutable: true }))
      _sudo(() => A.set(1, {}))
      expect(A.get(1)).not.to.equal(_sudo(() => A.get(1)))
      expect(() => { A.get(1).n = 1 }).to.throw('Cannot set n: immutable')
    })

    // ------------------------------------------------------------------------

    it('intrinsic update disabled', () => {
      const s = new Membrane(new Set(), mangle({ _immutable: true }))
      expect(() => s.add(1)).to.throw('Cannot update [object Set]: immutable')
    })
  })

  // --------------------------------------------------------------------------
  // Record reads
  // --------------------------------------------------------------------------

  describe('Record reads', () => {
    it('construct', () => {
      const A = makeCode(class A { }, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        new A() // eslint-disable-line
          expect(unmangle(record._reads)._has(A)).to.equal(true)
          expect(record._before.has(A)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('construct chain', () => {
      const A = makeCode(class A { }, { _recordReads: true })
      const B = makeCode(class B extends A { }, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        new B() // eslint-disable-line
          expect(unmangle(record._reads)._has(A)).to.equal(true)
          expect(unmangle(record._reads)._has(B)).to.equal(true)
          expect(record._before.has(A)).to.equal(true)
          expect(record._before.has(B)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('get', () => {
      const o = makeJig({}, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
          o.n // eslint-disable-line
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(o)).to.equal(true)
          expect(record._before.has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('get method', () => {
      const A = makeCode(class A { f () { } }, { _recordReads: true })
      const a = makeJig(new A(), { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        a.f // eslint-disable-line
          expect(unmangle(record._reads)._size).to.equal(2)
          expect(unmangle(record._reads)._has(A)).to.equal(true)
          expect(unmangle(record._reads)._has(a)).to.equal(true)
          expect(record._before.has(A)).to.equal(true)
          expect(record._before.has(a)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('get parent method', () => {
      const A = makeCode(class A { f () { } }, { _recordReads: true })
      const B = makeCode(class B extends A { }, { _recordReads: true })
      const b = makeJig(new B(), { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        b.f // eslint-disable-line
          expect(unmangle(record._reads)._size).to.equal(3)
          expect(unmangle(record._reads)._has(A)).to.equal(true)
          expect(unmangle(record._reads)._has(B)).to.equal(true)
          expect(unmangle(record._reads)._has(b)).to.equal(true)
          expect(record._before.has(A)).to.equal(true)
          expect(record._before.has(B)).to.equal(true)
          expect(record._before.has(b)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor', () => {
      const o = makeJig({}, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
          Object.getOwnPropertyDescriptor(o, 'n')
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(o)).to.equal(true)
          expect(record._before.has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('getPrototypeOf', () => {
      const A = makeCode(class A { f () { } }, { _recordReads: true })
      const a = makeJig(new A(), { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
          Object.getPrototypeOf(a)
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(a)).to.equal(true)
          expect(record._before.has(a)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('has', () => {
      const o = makeJig({}, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        'n' in o // eslint-disable-line
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(o)).to.equal(true)
          expect(record._before.has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('ownKeys', () => {
      const o = makeJig({}, { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
          Object.keys(o)
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(o)).to.equal(true)
          expect(record._before.has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('intrinsicGetMethod', () => {
      const s = makeJig(new Set(), { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
        s.add // eslint-disable-line
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(s)).to.equal(true)
          expect(record._before.has(s)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('intrinsicRead', () => {
      const m = makeJig(new Map(), { _recordReads: true })
      testRecord(record => {
        simulateAction(() => {
          m.has(1)
          expect(unmangle(record._reads)._size).to.equal(1)
          expect(unmangle(record._reads)._has(m)).to.equal(true)
          expect(record._before.has(m)).to.equal(true)
        })
      })
    })
  })

  // --------------------------------------------------------------------------
  // Record updates
  // --------------------------------------------------------------------------

  describe('Record updates', () => {
    it('define', () => {
      const o = makeJig({}, { _recordUpdates: true })
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      testRecord(record => {
        simulateAction(() => {
          Object.defineProperty(o, 'n', desc)
          expect(record._before.has(o)).to.equal(true)
          expect(unmangle(record._updates)._size).to.equal(1)
          expect(unmangle(record._updates)._has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('delete', () => {
      const o = makeJig({}, { _recordUpdates: true })
      testRecord(record => {
        simulateAction(() => {
          delete o.n
          expect(record._before.has(o)).to.equal(true)
          expect(unmangle(record._updates)._size).to.equal(1)
          expect(unmangle(record._updates)._has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('set', () => {
      const o = makeJig({}, { _recordUpdates: true })
      testRecord(record => {
        simulateAction(() => {
          o.n = 1
          expect(record._before.has(o)).to.equal(true)
          expect(unmangle(record._updates)._size).to.equal(1)
          expect(unmangle(record._updates)._has(o)).to.equal(true)
        })
      })
    })

    // ------------------------------------------------------------------------

    it('intrinsicUpdate', () => {
      const m = makeJig(new Map(), { _recordUpdates: true })
      testRecord(record => {
        simulateAction(() => {
          m.set(1, 2)
          expect(record._before.has(m)).to.equal(true)
          expect(unmangle(record._updates)._size).to.equal(1)
          expect(unmangle(record._updates)._has(m)).to.equal(true)
        })
      })
    })
  })

  // --------------------------------------------------------------------------
  // Record calls
  // --------------------------------------------------------------------------

  describe('Record calls', () => {
    it('apply static method to code', () => {
      class A { static f () { this._n = 1 }}
      const A2 = makeJig(A, {
        _recordReads: true,
        _recordUpdates: true,
        _recordableTarget: true,
        _recordCalls: true
      })
      testRecord(record => {
        A2.f()
        expect(unmangle(record._reads)._size).to.equal(1)
        expect(unmangle(record._reads)._has(A2)).to.equal(true)
        expect(record._actions.length).to.equal(1)
        expect(unmangle(record._actions[0])._method).to.equal('f')
        expect(unmangle(record._actions[0])._creation).to.equal(A2)
        expect(record._before.has(A2)).to.equal(true)
        expect(unmangle(record._updates)._size).to.equal(1)
        expect(unmangle(record._updates)._has(A2)).to.equal(true)
        expect(A2._n).to.equal(1)
      })
    })

    // ------------------------------------------------------------------------

    it('apply method to instance', () => {
      class A { f () { this._n = 1 }}
      const A2 = makeCode(A, {
        _recordReads: true,
        _recordUpdates: true,
        _recordableTarget: true,
        _recordCalls: true
      })
      const a = new A2()
      const a2 = makeJig(a, {
        _recordReads: true,
        _recordUpdates: true,
        _recordableTarget: true,
        _recordCalls: true
      })
      testRecord(record => {
        a2.f()
        expect(unmangle(record._reads)._has(A2)).to.equal(true)
        expect(record._actions.length).to.equal(1)
        expect(unmangle(record._actions[0])._method).to.equal('f')
        expect(unmangle(record._actions[0])._creation).to.equal(a2)
        expect(record._before.has(a2)).to.equal(true)
        expect(record._before.has(A2)).to.equal(true)
        expect(unmangle(record._updates)._size).to.equal(1)
        expect(unmangle(record._updates)._has(a2)).to.equal(true)
        expect(a2._n).to.equal(1)
      })
    })

    // ------------------------------------------------------------------------

    it('args passed through if not recordable', () => {
      class A { static f (x) { return typeof x === 'symbol' } }
      const A2 = makeCode(A, { _recordableTarget: true, _recordCalls: false })
      expect(A2.f(Symbol.hasInstance)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('return values passed through if recordable', () => {
      class A { static f () { return Symbol.hasInstance } }
      const A2 = makeCode(A, { _recordableTarget: true, _recordCalls: false })
      expect(A2.f()).to.equal(Symbol.hasInstance)
    })

    // ------------------------------------------------------------------------

    it('no action if not recordable', () => {
      class A { static f () { } }
      const A2 = makeCode(A, { _recordableTarget: true, _recordCalls: false })
      testRecord(record => {
        A2.f()
        expect(record._actions.length).to.equal(0)
      })
    })

    // ------------------------------------------------------------------------

    // This test takes several seconds on WebKit but milliseconds on other browsers
    it('pass through depends on whether thisArg is recordable target', function () {
      this.timeout(10000)
      // Returning a WeakMap will fail when callable due to unserializability
      const options = mangle({ _recordCalls: true })
      const f = new Membrane(function f () { return new WeakMap() }, options)
      const a = makeJig({ f }, { _recordableTarget: false })
      const b = makeJig({ f }, { _recordableTarget: true })
      expect(() => a.f()).not.to.throw()
      testRecord(() => expect(() => b.f()).to.throw())
    })
  })

  // --------------------------------------------------------------------------
  // Smart API
  // --------------------------------------------------------------------------

  describe('Smart API', () => {
    it('delete throws if outside method', () => {
      const a = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      expect(() => { delete a.n }).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('delete allowed in jig methods', () => {
      class A { static f () { delete this.n } }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(record => a.f())
    })

    // ------------------------------------------------------------------------

    it('delete throws from another jigs method', () => {
      class A { static f (b) { delete b.n } }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const b = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      testRecord(record => expect(() => a.f(b)).to.throw(error))
    })

    // ------------------------------------------------------------------------

    it('defineProperty throws if outside method', () => {
      const a = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      expect(() => Object.defineProperty(a, 'n', desc)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('defineProperty allowed in jig methods', () => {
      class A {
        static f () {
          const desc = { value: 1, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(this, 'n', desc)
        }
      }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(record => a.f())
    })

    // ------------------------------------------------------------------------

    it('defineProperty throws from another jigs method', () => {
      class A {
        static f (b) {
          const desc = { value: 1, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(b, 'n', desc)
        }
      }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const b = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      testRecord(record => expect(() => a.f(b)).to.throw(error))
    })

    // ------------------------------------------------------------------------

    it('set throws if outside method', () => {
      const a = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      expect(() => { a.n = 1 }).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('set allowed in jig methods', () => {
      class A { static f () { this.n = 1 } }
      const a = makeJig(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(record => a.f())
    })

    // ------------------------------------------------------------------------

    it('set throws from another jigs method', () => {
      class A { static f (b) { b.n = 1 } }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const b = makeJig({}, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Object] outside of a method'
      testRecord(record => expect(() => a.f(b)).to.throw(error))
    })

    // ------------------------------------------------------------------------

    it('intrinsicUpdate throws if outside method', () => {
      const s = makeJig(new Set(), { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Set] outside of a method'
      expect(() => s.add(1)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('intrinsicUpdate allowed in jig methods', () => {
      class A { static f () { this.set.add(1) } }
      A.set = new Set()
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(record => a.f())
    })

    // ------------------------------------------------------------------------

    it('intrinsicUpdate throws from another jigs method', () => {
      class A { static f (b) { b.add(1) } }
      const a = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const b = makeJig(new Set(), { _recordCalls: true, _smartAPI: true })
      const error = 'Attempt to update [jig Set] outside of a method'
      testRecord(record => expect(() => a.f(b)).to.throw(error))
    })
  })

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  describe('Private', () => {
    it('apply throws if outside', () => {
      class A { static _f () { return 1 } }
      const options = { _recordableTarget: true, _recordCalls: true, _privacy: true }
      const A2 = makeCode(A, options)
      expect(() => testRecord(() => A2._f())).to.throw('Cannot call private method _f')
    })

    // ------------------------------------------------------------------------

    it('apply allowed in jig methods', () => {
      class A {
        static _f () { return 1 }
        static g () { return this._f() }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _privacy: true }
      const A2 = makeCode(A, options)
      expect(testRecord(() => A2.g())).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('delete allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _privacy: true }))
      delete A._n
    })

    // ------------------------------------------------------------------------

    it('delete allowed in jig methods', () => {
      class A { static f () { delete this._n } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('delete throws from another jigs method', () => {
      class A { static f (b) { delete b._n } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot delete private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('define allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      Object.defineProperty(A, '_n', desc)
    })

    // ------------------------------------------------------------------------

    it('define allowed in jig methods', () => {
      class A {
        static f () {
          const desc = { value: 1, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(this, '_n', desc)
        }
      }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('define throws from another jigs method', () => {
      class A {
        static f (b) {
          const desc = { value: 1, configurable: true, enumerable: true, writable: true }
          Object.defineProperty(b, '_n', desc)
        }
      }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot define private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('get allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      _sudo(() => { A._n = 1 })
      expect(A._n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('get __proto__ allowed from outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      // eslint-disable-next-line
      expect(() => A.__proto__).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('get allowed in jig methods', () => {
      class A { static f () { return this._n } }
      A._n = 1
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('get throws from another jigs method', () => {
      class A { static f (b) { return b._n } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot get private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      Object.getOwnPropertyDescriptor(A, '_n')
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor allowed in jig methods', () => {
      class A { static f () { return Object.getOwnPropertyDescriptor(this, '_n') } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('getOwnPropertyDescriptor throws from another jigs method', () => {
      class A { static f (b) { return Object.getOwnPropertyDescriptor(b, '_n') } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot get descriptor for private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('has allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      expect('_n' in A).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('has allowed in jig methods', () => {
      class A { static f () { return '_n' in this } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('has throws from another jigs method', () => {
      class A { static f (b) { return '_n' in b } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot check private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('ownKeys includes all properties if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      _sudo(() => { A._n = 1 })
      expect(Object.getOwnPropertyNames(A).includes('_n')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('ownKeys returns private properties in jig methods', () => {
      class A { static f () { return Object.getOwnPropertyNames(this).includes('_n') } }
      A._n = 1
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      expect(testRecord(() => a.f())).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('ownKeys filters private properties from another jigs method', () => {
      class A { static f (b) { return Object.getOwnPropertyNames(b).includes('_n') } }
      A._n = 1
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      expect(testRecord(() => a.f(b))).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('set allowed if outside', () => {
      const A = new Membrane(class A { }, mangle({ _admin: true, _privacy: true }))
      A._n = 1
    })

    // ------------------------------------------------------------------------

    it('set allowed in jig methods', () => {
      class A { static f () { this._n = 1 } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('set throws from another jigs method', () => {
      class A { static f (b) { b._n = 1 } }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const a = makeCode(A, options)
      const b = makeJig({}, options)
      const error = 'Cannot set private property _n'
      expect(() => testRecord(() => a.f(b))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('get method allowed from instance', () => {
      class A {
        g () { return this._f() }
        _f (b) { return 1 }
      }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const A2 = makeCode(A, options)
      const b = makeJig(new A2(), options)
      expect(testRecord(() => b.g())).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('get allowed from instance of same class', () => {
      class A {
        constructor () { this._n = 1 }
        f (b) { return b._n }
      }
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      const A2 = makeCode(A, options)
      const a = makeJig(new A2(), options)
      const b = makeJig(new A2(1), options)
      expect(testRecord(() => a.f(b))).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('accessible from inner object of same jig', () => {
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      class A { static f (b) { return b._n } }
      const a = makeCode(A, options)
      const b = makeJig({ _n: 1 }, Object.assign({ _creation: a }, options))
      expect(testRecord(() => a.f(b))).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('throws when access parent class property', () => {
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      class A { static testGet () { return this._n } }
      const A2 = makeCode(A, options)
      class B extends A2 { }
      const B2 = makeCode(B, options)
      A._n = 1
      expect(() => testRecord(() => B2.testGet())).to.throw('Cannot get private property _n')
    })

    // ------------------------------------------------------------------------

    it('accessible if access child class property with parent method', () => {
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      class A { static testGet () { return this._n } }
      const A2 = makeCode(A, options)
      class B extends A2 { }
      const B2 = makeCode(B, options)
      Object.defineProperty(A, '_n', { value: 1, configurable: true, enumerable: true, writable: true })
      Object.defineProperty(B, '_n', { value: 2, configurable: true, enumerable: true, writable: true })
      expect(testRecord(() => B2.testGet())).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('cannot access on instance with different class chain', () => {
      const options = { _privacy: true, _recordableTarget: true, _recordCalls: true }
      class A { f (z) { return z._n } }
      const A2 = makeCode(A, options)
      class B extends A2 { }
      const B2 = makeCode(B, options)
      const x = makeJig(new A2(), options)
      const y = makeJig(new B2(), options)
      const error = 'Cannot get private property _n'
      expect(() => testRecord(() => x.f(y))).to.throw(error)
      expect(() => testRecord(() => y.f(x))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('does not clone private properties on assign', () => {
      class A { static f () { this.o = { _n: 1, o: { _m: 2 } } } }
      class B { static g (a) { this.o = a.o } }
      const a = makeCode(A, { _privacy: true })
      const b = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      testRecord(() => a.f())
      testRecord(() => b.g(a))
      expect(b.o).not.to.equal(a.o)
      expect(typeof b.o._n).to.equal('undefined')
      expect(typeof b.o.o._m).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('does not clone private properties on assign pending', () => {
      class A { static f () { this.o = { _n: 1, o: { _m: 2 } } } }
      class B { static g (a) { this.x = { o: a.o } } }
      const a = makeCode(A, { _privacy: true })
      const b = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      testRecord(() => a.f())
      testRecord(() => b.g(a))
      expect(b.x.o).not.to.equal(a.o)
      expect(typeof b.x.o._n).to.equal('undefined')
      expect(typeof b.x.o.o._m).to.equal('undefined')
    })
  })

  // --------------------------------------------------------------------------
  // Serializable
  // --------------------------------------------------------------------------

  describe('Serializable', () => {
    it('cannot define symbol prop name', () => {
      const a = new Membrane({})
      const desc = { value: 1, configurable: true, enumerable: true, writable: true }
      const error = 'Cannot define symbol property'
      expect(() => Object.defineProperty(a, Symbol.hasInstance, desc)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot define unserializable value', () => {
      const a = new Membrane({})
      const testFail = x => {
        const desc = { value: x, configurable: true, enumerable: true, writable: true }
        expect(() => Object.defineProperty(a, 'n', desc)).to.throw()
      }
      testFail(Symbol.hasInstance)
      testFail(new (class MySet extends Set { })())
      testFail(Math)
      testFail(() => { })
    })

    // ------------------------------------------------------------------------

    it('cannot define unserializable inner value', () => {
      const a = new Membrane({})
      const testFail = x => {
        const desc = { value: x, configurable: true, enumerable: true, writable: true }
        expect(() => Object.defineProperty(a, 'n', desc)).to.throw()
      }
      testFail({ inner: Symbol.hasInstance })
    })

    // ------------------------------------------------------------------------

    it('cannot set symbol prop name', () => {
      const a = new Membrane({})
      const error = 'Cannot set symbol property'
      expect(() => { a[Symbol.hasInstance] = 1 }).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot set unserializable value', () => {
      const a = new Membrane({})
      const testFail = x => expect(() => { a.n = x }).to.throw()
      testFail(Symbol.hasInstance)
      testFail(new (class MySet extends Set { })())
      testFail(Math)
      testFail(function f () { })
    })

    // ------------------------------------------------------------------------

    it('cannot set unserializable inner value', () => {
      const a = new Membrane({})
      const testFail = x => expect(() => { a.n = x }).to.throw()
      testFail({ inner: Symbol.hasInstance })
    })

    // ------------------------------------------------------------------------

    it('cannot intrinsic in unserializable value', () => {
      const s = new Membrane(new Set())
      expect(() => s.add(Symbol.hasInstance)).to.throw('Not serializable')
    })

    // ------------------------------------------------------------------------

    it('cannot pass unserializable arg to internal method', () => {
      class A {
        static f () {
          function h () { }
          this.g(h)
        }

        static g () { }
      }
      const C = makeCode(A, { _recordCalls: true, _recordableTarget: true })
      expect(() => testRecord(() => C.f())).to.throw('Not serializable')
    })

    // ------------------------------------------------------------------------

    it('cannot return unserializable value from internal method', () => {
      class A {
        static f () {
          this.g()
        }

        static g () {
          return function h () { }
        }
      }
      const C = makeCode(A, { _recordCalls: true, _recordableTarget: true })
      expect(() => testRecord(() => C.f())).to.throw('Not serializable')
    })

    // ------------------------------------------------------------------------

    it('cannot delete symbol prop name', () => {
      const a = new Membrane({})
      const error = 'Cannot delete symbol property'
      expect(() => { delete a[Symbol.hasInstance] }).to.throw(error)
    })
  })

  // --------------------------------------------------------------------------
  // Ownership
  // --------------------------------------------------------------------------

  describe('Ownership', () => {
    it('set copies object owned by another jig', () => {
      const a = makeJig({})
      const ai = new Membrane({}, mangle({ _creation: a }))
      const b = makeJig({})
      b.n = ai
      b.n.m = 1
      expect(b.n).not.to.equal(ai)
      expect(b.n.m).to.equal(1)
      expect(typeof ai.m).to.equal('undefined')
      a.n2 = b.n
      expect(a.n2).not.to.equal(b.n)
    })

    // ------------------------------------------------------------------------

    it('set copies foreign in pending after method ends', () => {
      class A {
        static f (CB) {
          this.a = [CB.x]
          this.a.push(1)
          return this.a[0]
        }

        static g (CB) {
          this.y = [CB.x]
          this.y[0].n = 1
        }
      }

      class B { }
      B.x = []

      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      expect(testRecord(() => CA.f(CB))).to.equal(CB.x)
      expect(CA.a[0]).not.to.equal(CB.x)
      expect(CA.a.length).to.equal(2)
      expect(() => testRecord(() => CA.g(CB))).to.throw('Attempt to update B outside of a method')
    })

    // ------------------------------------------------------------------------

    it('defineProperty copies foreign', () => {
      const a = makeJig({})
      const ai = new Membrane(new Set([1, 2, 3]), mangle({ _creation: a }))
      const b = makeJig({})
      const desc = { value: ai, configurable: true, enumerable: true, writable: true }
      Object.defineProperty(b, 'n', desc)
      b.n.m = 1
      expect(b.n).not.to.equal(ai)
      expect(b.n).to.deep.equal(ai)
      expect(b.n instanceof SI.Set).to.equal(true)
      expect(b.n.m).to.equal(1)
      expect(typeof ai.m).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('defineProperty copies foreign inner', () => {
      const a = makeJig({})
      const ai = new Membrane({}, mangle({ _creation: a }))
      const b = makeJig({})
      const bi = new Membrane({}, mangle({ _creation: b }))
      const desc = { value: bi, configurable: true, enumerable: true, writable: true }
      Object.defineProperty(ai, 'n', desc)
      ai.m = 1
      expect(ai.n).not.to.equal(bi)
      expect(typeof b.m).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('intrinsicIn copies object owned by another jig', () => {
      const a = makeJig({})
      const ai = new Membrane({}, mangle({ _creation: a }))
      const b = makeJig(new Map())
      b.set(1, ai)
      b.get(1).m = 1
      expect(b.get(1)).not.to.equal(ai)
      expect(b.get(1).m).to.equal(1)
      expect(typeof ai.m).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('intrinsicIn copies foreign in pending after method ends', () => {
      class A {
        static f (CB) {
          this.m.set(1, { x: CB.x })
          return this.m.get(1).x
        }
      }
      A.m = new Map()

      class B { }
      B.x = { }

      const CA = makeJig(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const CB = makeJig(B)

      expect(testRecord(() => CA.f(CB))).to.equal(CB.x)
      expect(CA.m.get(1)).not.to.equal(CB.x)
    })

    // ------------------------------------------------------------------------

    it('set allowed if owned by us', () => {
      const a = makeJig({})
      const ai = new Membrane({}, mangle({ _creation: a }))
      a.n = ai
      a.o = { ai }
      a.n.m = 1
      expect(ai.m).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('defineProperty allowed if owned by us', () => {
      const a = makeJig({})
      const b = new Membrane({}, mangle({ _creation: a }))
      const desc = { value: b, configurable: true, enumerable: true, writable: true }
      Object.defineProperty(a, 'n', desc)
    })

    // ------------------------------------------------------------------------

    it('intrinsicIn allowed if owned by us', () => {
      const a = makeJig(new Set())
      const b = new Membrane({}, mangle({ _creation: a }))
      a.add(b)
    })

    // ------------------------------------------------------------------------

    it('foreign property returned without claim', () => {
      class A { }
      A.x = { }
      const CA = makeCode(A, { _smartAPI: true })
      class B {
        static f (CA) {
          return CA.x
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      const x = testRecord(() => CB.f(CA))
      expect(x).to.equal(CA.x)
      expect(() => { x.n = 2 }).to.throw('Attempt to update A outside of a method')
    })
  })

  // --------------------------------------------------------------------------
  // Pending membranes
  // --------------------------------------------------------------------------

  describe('Pending membranes', () => {
    it('get pending in method', () => {
      class A {
        f () {
          const o = { }
          this.x = o
          if (this.x !== o) throw new Error()
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true }
      const A2 = makeCode(A, options)
      const a = makeJig(new A2(), options)
      testRecord(() => a.f())
    })

    // ------------------------------------------------------------------------

    it('get pending in inner method', () => {
      class A {
        static f () {
          const o = { }
          this.o = o
          const o2 = this.g(o)
          if (o2 !== o) throw new Error()
        }

        static g (o) {
          if (o !== this.o) throw new Error()
          return o
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true }
      const A2 = makeCode(A, options)
      testRecord(() => A2.f())
    })

    // ------------------------------------------------------------------------

    it('get pending from intrinsic', () => {
      class A {
        static f () {
          this.m = new Map()
        }

        static g () {
          const o = { n: 1 }
          this.m.set(1, o)
          if (this.m.get(1) !== o) throw new Error()
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true }
      const A2 = makeCode(A, options)
      testRecord(() => A2.f())
      testRecord(() => A2.g())
    })

    // ------------------------------------------------------------------------

    it('get own property descriptor of pending', () => {
      class A {
        static f () {
          const o = { }
          this.x = o
          if (Object.getOwnPropertyDescriptor(this, 'x').value !== o) throw new Error()
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true }
      const C = makeCode(A, options)
      testRecord(() => C.f())
    })

    // ------------------------------------------------------------------------

    it('get pending on inner property', () => {
      class A {
        static f () {
          const o = { }
          this.x = []
          this.x.push(o)
          if (this.x[0] !== o) throw new Error()
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true }
      const C = makeCode(A, options)
      testRecord(() => C.f())
    })

    // ------------------------------------------------------------------------

    it('returns pending as membrane to another jig', () => {
      class A {
        static f () {
          const o = {}
          this.o = o
          return o
        }
      }
      class B {
        static g (a) {
          const o = a.f()
          if (o !== a.o) throw new Error()
        }

        static h (a) { a.f().n = 1 }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      testRecord(() => B2.g(A2))
      testRecord(() => expect(() => B2.h(A2)).to.throw())
    })

    // ------------------------------------------------------------------------

    it('returns unclaimed as naked to another jig', () => {
      class A {
        static f () {
          return {}
        }
      }
      class B {
        static g (a) {
          const o = a.f()
          o.n = 2
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      testRecord(() => B2.g(A2))
    })

    // ------------------------------------------------------------------------

    it('returns circular unclaimed as naked to another jig', () => {
      class A {
        static f () {
          const o = {}
          o.o = o
          return o
        }
      }
      class B {
        static g (a) {
          const o = a.f()
          o.n = 2 // Test unclaimed
          return o === o.o
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      expect(testRecord(() => B2.g(A2))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns pending inner wrapped in naked to another jig', () => {
      class A {
        static f () {
          const o = {}
          const p = { o }
          this.o = o
          return p
        }
      }
      class B {
        static g (a) {
          const p = a.f()
          p.n = 2 // Test unclaimed
          return p.o === a.o
        }

        static h (a) {
          a.f().p.n = 3
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      expect(testRecord(() => B2.g(A2))).to.equal(true)
      expect(() => testRecord(() => B2.h(A2))).to.throw()
    })

    // ------------------------------------------------------------------------

    it('returns pending inner stored in naked intrinsic to another jig', () => {
      class A {
        static f () {
          const o = {}
          const p = new Map()
          const s = new Set()
          p.set(1, o)
          p.set(2, s)
          this.o = o
          this.s = s
          return p
        }
      }
      class B {
        static g (a) {
          const p = a.f()
          p.n = 2
          return p.get(1) === a.o && p.get(2) === a.s
        }
      }
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      testRecord(() => expect(B2.g(A2)).to.equal(true))
    })

    // ------------------------------------------------------------------------

    it('set naked to pending becomes pending', () => {
      class A {
        static f () {
          const x = { }
          const y = { }
          this.x = x
          x.y = y
          return y
        }
      }
      const C = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const y = testRecord(() => C.f())
      expect(y).to.equal(C.x.y)
      expect(() => { y.n = 1 }).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('foreign set to pending is cloned', () => {
      class A { }
      A.x = { }
      const CA = makeCode(A, { _smartAPI: true })
      class B {
        static f (CA) {
          const y = { }
          this.y = y
          y.x = CA.x
          return y.x
        }

        static g () {
          this.y.x.n = 1
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const Byx = testRecord(() => CB.f(CA))
      expect(Byx).to.equal(CA.x)
      expect(B.y.x).not.to.equal(CA.x)
      testRecord(() => CB.g())
      expect(CB.y.x.n).to.equal(1)
      expect(typeof CA.x.n).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('foreign set to pending inner is cloned', () => {
      class A { }
      A.x = new Set()
      const CA = makeCode(A, { _smartAPI: true })
      class B {
        static f (CA) {
          this.x = {}
          this.x.m = new Map()
          this.x.m.set('1', CA.x)
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(() => CB.f(CA))
      expect(CB.x.m.get('1')).not.to.equal(CA.x)
      const membrane = Proxy2._getHandler(CB.x.m.get('1'))
      expect(unmangle(membrane)._creation).to.equal(CB)
    })

    // ------------------------------------------------------------------------

    it('pending returned is pending retrieved internally', () => {
      class A {
        static f () {
          const x = {}
          this.x = x
          const y = { }
          x.y = y
          return x
        }

        static g () {
          const x = this.f()
          return this.x === x
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(testRecord(() => CA.g())).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('owned set to pending is kept intact', () => {
      class A {
        static f () {
          this.x = { }
        }

        static g () {
          this.y = { }
          this.y.x = this.x
          return this.y.x === this.x
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(() => CA.f())
      expect(testRecord(() => CA.g())).to.equal(true)
      expect(CA.y.x).to.equal(CA.x)
    })

    // ------------------------------------------------------------------------

    it('owned set to pending inner is kept intact', () => {
      class A {
        static f () {
          this.x = { }
        }

        static g () {
          this.y = { }
          this.y.z = { }
          this.y.z.x = this.x
          return this.y.z.x === this.x
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(() => CA.f())
      expect(testRecord(() => CA.g())).to.equal(true)
      expect(CA.y.z.x).to.equal(CA.x)
    })

    // ------------------------------------------------------------------------

    it('throws if unserializable set to pending', () => {
      class A {
        static f () {
          const x = {}
          this.x = x
          x.y = new WeakMap()
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CA.f())).to.throw('Not serializable: [object WeakMap]')
    })

    // ------------------------------------------------------------------------

    it('throws if unserializable set to pending inner', () => {
      class A {
        static f () {
          this.x = {}
          this.g()
        }

        static g () {
          this.x.y = new WeakSet()
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CA.f())).to.throw('Not serializable: [object WeakSet]')
    })

    // ------------------------------------------------------------------------

    it('throws if unserializable set to unclaimed args and returned', () => {
      class B {
        static f (CA) {
          this.arr = []
          CA.g(this.arr)
        }
      }
      class A {
        static g (arr) {
          arr.push(function h () { })
          return arr
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(() => testRecord(() => CB.f(CA))).to.throw('Not serializable: [object Array]')
    })

    // ------------------------------------------------------------------------

    it('throws if reserved set symbol prop to pending', () => {
      class A {
        static f () {
          const o = {}
          this.x = o
          o[Symbol.hasInstance] = 1
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _reserved: true })
      expect(() => testRecord(() => CA.f())).to.throw('Symbol properties not supported')
    })

    // ------------------------------------------------------------------------

    it('may define to pending', () => {
      class A {
        static f () {
          const o = {}
          this.x = o
          const desc = { configurable: true, enumerable: true, writable: true, value: [] }
          Object.defineProperty(o, 'arr', desc)
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      testRecord(() => CA.f())
      expect(CA.x.arr).to.deep.equal([])
      expect(() => CA.x.arr.push(1)).to.throw('Attempt to update A outside of a method')
    })

    // ------------------------------------------------------------------------

    it('throws if define getter to pending', () => {
      class A {
        static f () {
          const o = {}
          this.x = o
          const desc = { configurable: true, enumerable: true, get: () => 1 }
          Object.defineProperty(o, 'n', desc)
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CA.f())).to.throw('Descriptor must have a value')
    })

    // ------------------------------------------------------------------------

    it('throws if define setter to pending inner', () => {
      class A {
        static f () {
          const o = {}
          const p = new Map()
          this.x = o
          o.p = p
          const desc = { configurable: true, enumerable: true, set: () => 1 }
          Object.defineProperty(p, 'n', desc)
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CA.f())).to.throw('Descriptor must have a value')
    })

    // ------------------------------------------------------------------------

    it('throws if define non-configurable to pending', () => {
      class B { static f (CA) { CA.g({}) }}
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      class A {
        static g (o) {
          this.x = o
          const desc = { configurable: false, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(o, 'n', desc)
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(() => testRecord(() => CB.f(CA))).to.throw('Descriptor must be configurable')
    })

    // ------------------------------------------------------------------------

    it('throws if define non-writable to pending inner', () => {
      class B { static f (CA) { CA.g({}) }}
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      class A {
        static g (o) {
          const x = { }
          this.x = x
          x.o = o
          const p = {}
          o.p = p
          const desc = { configurable: true, enumerable: true, writable: false, value: 1 }
          Object.defineProperty(p, 'n', desc)
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(() => testRecord(() => CB.f(CA))).to.throw('Descriptor must be writable')
    })

    // ------------------------------------------------------------------------

    it('throws if define non-writable to pending inner', () => {
      class B { static f (CA) { CA.g({}) }}
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      class A {
        static g (o) {
          const p = {}
          o.p = p
          const desc = { configurable: true, enumerable: false, writable: true, value: 1 }
          Object.defineProperty(p, 'n', desc)
          this.o = o
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(() => testRecord(() => CB.f(CA))).to.throw('Descriptor must be enumerable')
    })

    // ------------------------------------------------------------------------

    it('may set reserved to pending inner', () => {
      class A {
        static f () {
          const o = {}
          o.p = new Set()
          this.x = o
          o.p.blocktime = 123
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _reserved: true })
      testRecord(() => CA.f())
      expect(CA.x.p.blocktime).to.equal(123)
    })

    // ------------------------------------------------------------------------

    it('may set private to pending', () => {
      class A {
        static f () {
          const o = {}
          this.x = o
          o._n = 1
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _privacy: true })
      testRecord(() => CA.f())
      expect(CA.x._n).to.equal(1)
      class B { static g (CA) { return CA.x._n } }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CB.g(CA))).to.throw('Cannot get private property _n')
    })

    // ------------------------------------------------------------------------

    it('assign args to pending', () => {
      class B {
        static f (CA) {
          this.o = {}
          CA.g(this.o)
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })

      class A {
        static g (o) {
          this.o = o
          o.n = 1
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CB.f(CA))
      expect(CA.o.n).to.equal(1)
      expect(typeof CB.o.n).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('assign args to pending inner', () => {
      class B {
        static f (CA) {
          this.o = {}
          CA.g(this.o)
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true })

      class A {
        static g (o) {
          const p = new Map()
          p.set('a', o)
          o.n = 1
          this.p = p
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CB.f(CA))
      expect(typeof CB.o.n).to.equal('undefined')
      expect(CA.p.get('a').n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('assign pending to unclaimed args returned', () => {
      class B {
        static f (CA) {
          const o = CA.g({})
          const q = { n: 1 }
          o.q = q
          this.o = o
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o) {
          return o
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CB.f(CA))
      expect(CB.o.q.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('assign pending to claimed args stored in pending', () => {
      class B {
        static f (CA) {
          const o = {}
          CA.g(o)
          return typeof o.q === 'undefined'
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o) {
          const p = { o }
          this.p = p
          o.q = { n: 1 }
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      expect(testRecord(() => CB.f(CA))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('foreign set to circular args in pending inner is cloned', () => {
      class B {
        static f (CA) {
          this.arr = []
          const o = {}
          o.o = o
          CA.g(o, this)
          this.arr.push(1)
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o, CB) {
          this.o = o
          this.o.arr = CB.arr
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CB.f(CA))
      expect(CA.o.arr.length).to.equal(0)
      expect(CB.arr.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('pending args with owned prop is kept intact', () => {
      class B {
        static f (CA) {
          CA.g({})
        }
      }
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o) {
          o.arr = this.arr
          this.x = { o }
        }
      }
      A.arr = []
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CB.f(CA))
      expect(CA.x.o.arr).to.equal(CA.arr)
    })

    // ------------------------------------------------------------------------

    it('inner proxies in pending are not pending', () => {
      class A {
        static f () {
          const o = { }
          this.o = o
          const z = this.y.z
          this.z2 = z
          o.z = z
          return z === o.z && z === this.y.z && this.z2 === this.o.z
        }
      }
      A.y = { z: { } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(testRecord(() => CA.f())).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('owned set to pending stays owned', () => {
      class A {
        static f () {
          const o = { }
          o.z = this.z
          this.o = o
          return !!Proxy2._getTarget(this.o.z) && !!Proxy2._getTarget(o.z)
        }
      }
      A.z = { }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      expect(testRecord(() => CA.f())).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // Reserved
  // --------------------------------------------------------------------------

  describe('Reserved', () => {
    it('cannot set reserved properties', () => {
      const a = new Membrane({}, mangle({ _reserved: true }))
      _RESERVED_PROPS.forEach(prop => {
        const error = `Cannot set ${prop}: reserved`
        expect(() => { a[prop] = 1 }).to.throw(error)
      })
    })

    // ------------------------------------------------------------------------

    it('cannot define reserve properties', () => {
      const a = new Membrane({}, mangle({ _reserved: true }))
      _RESERVED_PROPS.forEach(prop => {
        const error = `Cannot define ${prop}: reserved`
        const desc = { value: 1, configurable: true, enumerable: true, writable: true }
        expect(() => Object.defineProperty(a, prop, desc)).to.throw(error)
      })
    })

    // ------------------------------------------------------------------------

    it('can set inner property with reserved name', () => {
      const a = new Membrane({}, mangle({ _reserved: true }))
      a.o = {}
      a.o[_RESERVED_PROPS[0]] = 1
    })

    // ------------------------------------------------------------------------

    it('can set jig methods on non-jig', () => {
      expect(_RESERVED_JIG_PROPS.includes('sync') && !_RESERVED_PROPS.includes('sync')).to.equal(true)
      const a = new Membrane({}, mangle({ _reserved: true }))
      a.sync = 1
    })

    // ------------------------------------------------------------------------

    it('can set code methods on non-code', () => {
      expect(_RESERVED_CODE_PROPS.includes('toString') && !_RESERVED_PROPS.includes('toString')).to.equal(true)
      expect(_RESERVED_CODE_PROPS.includes('upgrade') && !_RESERVED_PROPS.includes('upgrade')).to.equal(true)
      expect(_RESERVED_CODE_PROPS.includes('sync') && !_RESERVED_PROPS.includes('sync')).to.equal(true)
      const a = new Membrane({}, mangle({ _reserved: true }))
      a.toString = 1
      a.upgrade = 1
      a.sync = 1
    })

    // ------------------------------------------------------------------------

    it('cannot set reserved jig methods on jig', () => {
      const a = new Membrane({}, mangle({ _reserved: true, _jigProps: true }))
      expect(() => { a.sync = 1 }).to.throw('Cannot set sync')
    })

    // ------------------------------------------------------------------------

    it('cannot define reserved jig methods on code', () => {
      const a = new Membrane({}, mangle({ _reserved: true, _codeProps: true }))
      expect(() => { a.toString = 1 }).to.throw('Cannot set toString')
      expect(() => { a.upgrade = 1 }).to.throw('Cannot set upgrade')
      expect(() => { a.sync = 1 }).to.throw('Cannot set sync')
    })
  })

  // --------------------------------------------------------------------------
  // Methods
  // --------------------------------------------------------------------------

  describe('Methods', () => {
    it('apply args are cloned from outside', () => {
      class A { static f (o) { o.n = 2 } }
      const A2 = makeCode(A, { _recordCalls: true, _recordableTarget: true })
      const o = { n: 1 }
      testRecord(() => A2.f(o))
      expect(o.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('apply args are cloned from another jig', () => {
      const options = { _recordableTarget: true, _recordCalls: true, _smartAPI: true }
      class B { static g (a) { this.o = { n: 1 }; a.f(this.o) } }
      class A { static f (o) { o.n = 2 } }
      const A2 = makeCode(A, options)
      const B2 = makeCode(B, options)
      testRecord(() => {
        B2.g(A2)
        expect(B2.o.n).to.equal(1)
      })
    })

    // ------------------------------------------------------------------------

    it('creations are intact from outside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      class A { }
      const A2 = makeCode(A, options)
      class B { static f (A2) { return A2 === B.A2 } }
      B.A2 = A2
      const B2 = makeCode(B, options)
      testRecord(() => expect(B2.f(A2)).to.equal(true))
    })

    // ------------------------------------------------------------------------

    it('unifies worldview with args', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const a1 = makeJig({}, options)
      const a2 = makeJig({}, options)
      _sudo(() => Object.assign(a2, a1))
      class A { static f (a2) { return this.a1 === a2 } }
      A.a1 = a1
      const A2 = makeCode(A, options)
      testRecord(() => expect(A2.f(a2)).to.equal(true))
    })

    // ------------------------------------------------------------------------

    it('async methods not supported', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static async f () { } }, options)
      expect(() => testRecord(() => A.f())).to.throw('async methods not supported')
    })

    // ------------------------------------------------------------------------

    it('deploys new code as args from outside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f () { this.n = 1 } }, options)
      testRecord(record => {
        A.f(function f () { })
        expect(record._actions.length).to.equal(2)
        expect(record._actions[0]._op === 'DEPLOY')
        expect(record._actions[1]._op === 'CALL')
      })
    })

    // ------------------------------------------------------------------------

    it('throws if pass new code as args from inside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      class A {
        static f () { this.g(class B { }) }
        static g () { this.n = 1 }
      }
      const A2 = makeCode(A, options)
      expect(() => testRecord(() => A2.f())).to.throw('Not serializable')
    })

    // ------------------------------------------------------------------------

    it('throws if call jig method on another jig', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f () { } }, options)
      const B = makeCode(class B { }, options)
      const error = 'Cannot call f'
      expect(() => testRecord(() => Reflect.apply(A.f, B, []))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if call jig method on another jig from inside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f () { } }, options)
      const B = makeCode(class B { static f () { return Reflect.apply(A.f, B, []) } }, options)
      const C = makeCode(class C { static f () { return B.f.apply(this, []) } }, options)
      const error = 'Cannot call f'
      expect(() => testRecord(() => C.f())).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if call overridden method from outside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f () { } }, options)
      const B = makeCode(class B extends A { static f () { } }, options)
      const error = 'Cannot call f'
      expect(() => testRecord(() => Reflect.apply(A.f, B, []))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('may call overridden method from inside', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f () { return 1 } }, options)
      const B = makeCode(class B extends A { static f () { return Reflect.apply(A.f, this, []) + 1 } }, options)
      const C = makeCode(class C extends B { static f () { return Reflect.apply(B.f, this, []) + 2 } }, options)
      expect(C.f()).to.equal(4)
    })

    // ------------------------------------------------------------------------

    it('clones args with sandbox intrinsics', () => {
      const options = { _recordableTarget: true, _recordCalls: true }
      const A = makeCode(class A { static f (x) { return x } }, options)
      const set = testRecord(() => A.f(new Set()))
      expect(set instanceof SI.Set)
    })

    // ------------------------------------------------------------------------

    it('thisless function', () => {
      function f () {
        'use strict'
        return this
      }
      const cf = new Membrane(f, mangle({ _thisless: true }))
      expect(cf()).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('thisless static method', () => {
      class A { static f () { return this } }
      const CA = new Membrane(A, mangle({ _thisless: true }))
      expect(CA.f()).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if apply to naked object', () => {
      class A extends Jig {
        static f () { const o = []; this.g.apply(o, []) }
        static g () { this.x = 1 }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true })
      expect(() => testRecord(() => CA.f())).to.throw('Cannot call g on [object Array]')
    })

    // ------------------------------------------------------------------------

    it('unclaimed args returned are different', () => {
      class B {
        static f (CA) {
          const o = {}
          return CA.g(o) === o
        }
      }

      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o) {
          return o
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      expect(testRecord(() => CB.f(CA))).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('claimed args returned are different', () => {
      class B {
        static f (CA) {
          return CA.g(this.arr) === this.arr
        }
      }
      B.arr = []

      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      class A {
        static g (o) {
          return o
        }
      }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      expect(testRecord(() => CB.f(CA))).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('pending is pending only for a frame', () => {
      // fN, gN, hN are different frames

      class A {
        static f (CB) {
          this.o = {}
          this.f2()

          CB.g(this)

          expect(typeof Proxy2._getTarget(this.q)).not.to.equal('undefined')
        }

        static f2 () {
          expect(typeof Proxy2._getTarget(this.o)).to.equal('undefined')
        }

        static h (CB) {
          expect(typeof Proxy2._getTarget(this.o)).not.to.equal('undefined')
          expect(typeof Proxy2._getTarget(CB.p)).not.to.equal('undefined')

          this.q = new Set()
        }
      }

      class B {
        static g (CA) {
          this.p = []
          this.g2()

          expect(typeof Proxy2._getTarget(CA.o)).not.to.equal('undefined')

          CA.h(this)
        }

        static g2 () {
          expect(typeof Proxy2._getTarget(this.p)).to.equal('undefined')
        }
      }

      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })
      const CB = makeCode(B, { _recordableTarget: true, _recordCalls: true, _smartAPI: true })

      testRecord(() => CA.f(CB))
    })

    // ------------------------------------------------------------------------

    it('autocode', () => {
      class A { static f () { return this.name === 'B' && this instanceof Code } }
      const CA = makeCode(A, { _recordableTarget: true, _recordCalls: true, _smartAPI: true, _autocode: true })
      class B extends CA { }
      expect(testRecord(() => B.f())).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // Disabled methods
  // --------------------------------------------------------------------------

  describe('Disabled methods', () => {
    it('disables sidekick class methods', () => {
      class A { static f () { } }
      const A2 = new Membrane(A, mangle({ _disabledMethods: ['f'] }))
      expect(() => A2.f()).to.throw('f disabled')
    })

    // ------------------------------------------------------------------------

    it('disables instance methods', () => {
      const A = makeCode(class A { f () { } })
      const a = new Membrane(new A(), mangle({ _disabledMethods: ['f'] }))
      expect(() => a.f()).to.throw('f disabled')
    })

    // ------------------------------------------------------------------------

    it('class does not disable instance', () => {
      const A = makeCode(class A { f () { } }, { _disabledMethods: ['f'] })
      const a = new Membrane(new A())
      expect(() => a.f()).not.to.throw()
    })
  })
})

// ------------------------------------------------------------------------------------------------
