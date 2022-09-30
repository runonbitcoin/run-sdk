/**
 * dynamic.js
 *
 * Tests for lib/kernel/dynamic.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const Dynamic = unmangle(unmangle(Run)._Dynamic)
const { _sudo } = unmangle(Run)

// ------------------------------------------------------------------------------------------------
// Dynamic
// ------------------------------------------------------------------------------------------------

describe('Dynamic', () => {
  describe('constructor', () => {
    it('creates base type', () => {
      const D = new Dynamic()
      expect(typeof D === 'function').to.equal(true)
      expect(D.toString()).to.equal('function dynamic() {}')
    })
  })

  describe('_getInnerType', () => {
    it('initially gets base type', () => {
      const D = new Dynamic()
      expect(typeof Dynamic._getInnerType(D)).to.equal('function')
    })

    it('returns changed type', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(Dynamic._getInnerType(D)).to.equal(A)
    })

    it('throws if not a dynamic type', () => {
      expect(() => Dynamic._getInnerType({})).to.throw('Not a dynamic type')
    })

    it('supports both inner and outer types', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      const P = new Proxy(D, {})
      Dynamic._setOuterType(D, P)
      expect(Dynamic._getInnerType(D)).to.equal(A)
      expect(Dynamic._getInnerType(P)).to.equal(A)
    })
  })

  describe('_setInnerType', () => {
    it('can change functions', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, function f () { })
      Dynamic._setInnerType(D, function g () { })
      Dynamic._setInnerType(D, function h () { })
      expect(D.name).to.equal('h')
    })

    it('can change classes', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      Dynamic._setInnerType(D, class B { })
      Dynamic._setInnerType(D, class C { })
      expect(D.name).to.equal('C')
    })

    it('can set child class', () => {
      const D = new Dynamic()
      class A { f () { } }
      class B extends A { }
      Dynamic._setInnerType(D, B)
      expect(D.name).to.equal('B')
      expect(typeof new D().f).to.equal('function')
    })

    it('cannot set to value type', () => {
      const D = new Dynamic()
      const error = 'Inner type must be a function type'
      expect(() => { Dynamic._setInnerType(D, 1) }).to.throw(error)
      expect(() => { Dynamic._setInnerType(D, null) }).to.throw(error)
      expect(() => { Dynamic._setInnerType(D, undefined) }).to.throw(error)
      expect(() => { Dynamic._setInnerType(D, 'function') }).to.throw(error)
      expect(() => { Dynamic._setInnerType(D, true) }).to.throw(error)
    })

    it('cannot change classes to functions', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      expect(() => { Dynamic._setInnerType(D, function f () { }) }).to.throw()
    })

    it('cannot change functions to classes', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, function f () { })
      expect(() => { Dynamic._setInnerType(D, class A { }) }).to.throw()
    })

    it('cannot have toString static function', () => {
      const D = new Dynamic()
      const error = 'toString is a reserved property'
      class A { static toString () { } }
      expect(() => { Dynamic._setInnerType(D, A) }).to.throw(error)
      class B extends A { }
      expect(() => { Dynamic._setInnerType(D, B) }).to.throw(error)
    })

    it('can change symbol methods', () => {
      const D = new Dynamic()
      class A { [Symbol.hasInstance] () { } }
      Dynamic._setInnerType(D, A)
      const d = new D()
      expect(d.hasInstance).to.equal(A.prototype.hasInstance)
    })

    it('can change static symbol methods', () => {
      const D = new Dynamic()
      class A { static [Symbol.hasInstance] () { } }
      Dynamic._setInnerType(D, A)
      expect(D.hasInstance).to.equal(A.hasInstance)
    })

    it('supports types from sandbox', () => {
      const f = unmangle(unmangle(Run)._Sandbox)._evaluate('function f() { }')[0]
      const D = new Dynamic()
      Dynamic._setInnerType(D, f)
    })

    it('throws if not a dynamic type', () => {
      expect(() => Dynamic._setInnerType({}, class A { })).to.throw('Not a dynamic type')
    })
  })

  describe('apply', () => {
    it('can call changed functions', () => {
      const D = new Dynamic()
      function f () { return 1 }
      function g () { return 2 }
      Dynamic._setInnerType(D, f)
      expect(D()).to.equal(1)
      Dynamic._setInnerType(D, g)
      expect(D()).to.equal(2)
    })

    it('can call functions with custom thisArg', () => {
      const D = new Dynamic()
      function f () { return this.n }
      Dynamic._setInnerType(D, f)
      expect(Reflect.apply(D, { n: 1 }, [])).to.equal(1)
    })

    it('cannot call classes', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => D()).to.throw()
    })
  })

  describe('defineProperty', () => {
    it('defines on inner type', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      Object.defineProperty(D, 'x', { value: 1, configurable: true })
      expect(D.x).to.equal(1)
      expect(A.x).to.equal(1)
    })

    it('cannot define prototype', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => Object.defineProperty(D, 'prototype', { value: 123 })).to.throw()
      expect(D.prototype).not.to.equal(123)
    })

    it('cannot define toString', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => Object.defineProperty(D, 'toString', { value: 123 })).to.throw()
    })

    it('prevent non-configurable properties', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => Object.defineProperty(D, 'x', { value: 1 })).to.throw()
      expect(() => Object.defineProperty(D, 'y', { value: 2, configurable: false })).to.throw()
    })
  })

  describe('delete', () => {
    it('deletes on inner type', () => {
      const D = new Dynamic()
      class A { }
      A.n = 1
      Dynamic._setInnerType(D, A)
      delete D.n
      expect(A.n).to.equal(undefined)
    })

    it('cannot delete prototype', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => delete D.prototype).to.throw()
      expect(D.prototype).not.to.equal(undefined)
    })

    it('cannot delete toString', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => delete D.toString).to.throw()
      expect(D.toString).not.to.equal(undefined)
    })
  })

  describe('get', () => {
    it('basic property', () => {
      const D = new Dynamic()
      class A { }
      A.x = 1
      Dynamic._setInnerType(D, A)
      expect(A.x).to.equal(1)
    })

    it('binds functions to dynamic', () => {
      const D = new Dynamic()
      class A { static f () { this.thisInF = this } }
      Dynamic._setInnerType(D, A)
      D.f()
      expect(D.thisInF).to.equal(D)
    })

    it('toString should be bound to inner type', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(D.toString()).to.equal(A.toString())
    })

    it('get on child class', () => {
      class A { }
      class B extends A { }
      B.n = 2
      A.n = 1
      const DA = new Dynamic()
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      Dynamic._setInnerType(DB, B)
      expect(DA.n).to.equal(1)
      expect(DB.n).to.equal(2)
    })

    it('toString is the same for all instances', () => {
      const DA = new Dynamic()
      const DB = new Dynamic()
      Dynamic._setInnerType(DA, class A {})
      Dynamic._setInnerType(DB, class B {})
      expect(DA.toString).to.equal(DB.toString)
      expect(DA.toString()).not.to.equal(DB.toString())
    })

    it('methods are the same for every get', () => {
      const D = new Dynamic()
      class A { static f () { } }
      Dynamic._setInnerType(D, A)
      expect(typeof D.f).to.equal('function')
      expect(D.f).to.equal(D.f)
    })
  })

  describe('getOwnPropertyDescriptor', () => {
    it('returns property descriptor of inner type', () => {
      const D = new Dynamic()
      class A { static f () { } }
      Dynamic._setInnerType(D, A)
      const descA = Object.getOwnPropertyDescriptor(A, 'f')
      const descD = Object.getOwnPropertyDescriptor(D, 'f')
      expect(descA.value).to.equal(A.f)
      expect(descA).to.deep.equal(descD)
    })

    it('returns property descriptor of child class', () => {
      class A { static f () { }}
      class B extends A { static f () { } }
      const DA = new Dynamic()
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      Dynamic._setInnerType(DB, B)
      const descA = Object.getOwnPropertyDescriptor(A, 'f')
      const descB = Object.getOwnPropertyDescriptor(B, 'f')
      const descDA = Object.getOwnPropertyDescriptor(DA, 'f')
      const descDB = Object.getOwnPropertyDescriptor(DB, 'f')
      expect(descA.value).to.equal(A.f)
      expect(descB.value).to.equal(B.f)
      expect(descA).to.deep.equal(descDA)
      expect(descB).to.deep.equal(descDB)
      expect(descA).not.to.deep.equal(descB)
      expect(descDA).not.to.deep.equal(descDB)
    })

    it('returns prototype of base type', () => {
      const D = new Dynamic()
      const desc = Object.getOwnPropertyDescriptor(D, 'prototype')
      Dynamic._setInnerType(D, class A { })
      expect(Object.getOwnPropertyDescriptor(D, 'prototype')).to.deep.equal(desc)
    })
  })

  describe('getPrototypeOf', () => {
    it('returns inner type parent', () => {
      class A { }
      class B extends A { }
      const D = new Dynamic()
      Dynamic._setInnerType(D, B)
      expect(Object.getPrototypeOf(D)).to.equal(A)
    })

    it('returns Function.prototype for base functions', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, function f () { })
      expect(Object.getPrototypeOf(D)).to.equal(Function.prototype)
    })
  })

  describe('has', () => {
    it('returns has on the inner type', () => {
      const D = new Dynamic()
      D.n = 1
      expect('n' in D).to.equal(true)
      Dynamic._setInnerType(D, class A { })
      expect('n' in D).to.equal(false)
    })
  })

  describe('isExtensible', () => {
    it('is initially true', () => {
      const D = new Dynamic()
      expect(Object.isExtensible(D)).to.equal(true)
    })

    it('changes with inner type', () => {
      const D = new Dynamic()
      class A { }
      Object.preventExtensions(A)
      Dynamic._setInnerType(D, A)
      expect(Object.isExtensible(D)).to.equal(false)
    })
  })

  describe('ownKeys', () => {
    it('returns own keys on the inner type', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      D.n = 1
      expect(Object.getOwnPropertyNames(D).includes('n')).to.equal(true)
    })
  })

  describe('preventExtensions', () => {
    it('makes non-extensible permanently', () => {
      const D = new Dynamic()
      class A { }
      class B { }
      Dynamic._setInnerType(D, A)
      Object.preventExtensions(D)
      expect(Object.isExtensible(D)).to.equal(false)
      expect(Object.isExtensible(A)).to.equal(false)
      Dynamic._setInnerType(D, B)
      expect(Object.isExtensible(D)).to.equal(false)
      expect(Object.isExtensible(B)).to.equal(false)
    })
  })

  describe('prototype', () => {
    it('always returns base prototype', () => {
      const D = new Dynamic()
      const basePrototype = D.prototype
      Dynamic._setInnerType(D, class A { })
      expect(D.prototype).to.equal(basePrototype)
    })

    it('has prototypes of parents', () => {
      const D = new Dynamic()
      class A {}
      class B extends A {}
      class C extends B { }
      Dynamic._setInnerType(D, C)
      expect(D.prototype instanceof A).to.equal(true)
      expect(D.prototype instanceof B).to.equal(true)
    })

    it('prototype properties cannot be set', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      expect(() => { D.prototype.x = 1 }).to.throw()
      expect(D.prototype.x).to.equal(undefined)
    })

    it('prototype properties cannot be defined', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      expect(() => Object.defineProperty(D.prototype, 'x', { value: 1 })).to.throw()
      expect(D.prototype.x).to.equal(undefined)
    })

    it('prototype prototype cannot be changed', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const protoproto = Object.getPrototypeOf(D.prototype)
      expect(() => Object.setPrototypeOf(D.prototype, {})).to.throw()
      expect(Object.getPrototypeOf(D.prototype)).to.equal(protoproto)
    })
  })

  describe('method table', () => {
    it('method table properties cannot be set', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const protoproto = Object.getPrototypeOf(D.prototype)
      expect(() => { protoproto.x = 1 }).to.throw()
      expect(protoproto.x).to.equal(undefined)
    })

    it('method table properties cannot be defined', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const protoproto = Object.getPrototypeOf(D.prototype)
      expect(() => Object.defineProperty(protoproto, 'x', { value: 1 })).to.throw()
      expect(protoproto.x).to.equal(undefined)
    })

    it('method table properties cannot be deleted', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { f () { } })
      const protoproto = Object.getPrototypeOf(D.prototype)
      expect(() => delete protoproto.f).to.throw()
      expect(typeof protoproto.f).to.equal('function')
    })

    it('method table prototype cannot be changed', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const protoproto = Object.getPrototypeOf(D.prototype)
      const protoprotoproto = Object.getPrototypeOf(protoproto)
      expect(() => Object.setPrototypeOf(protoproto, {})).to.throw()
      expect(Object.getPrototypeOf(protoproto)).to.equal(protoprotoproto)
    })

    it('method table prototype cannot be made unextensible', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const protoproto = Object.getPrototypeOf(D.prototype)
      expect(() => Object.preventExtensions(protoproto)).to.throw()
      expect(Object.isExtensible(protoproto)).to.equal(true)
    })
  })

  describe('set', () => {
    it('sets on inner type', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      D.n = 1
      expect(A.n).to.equal(1)
    })

    it('old properties are not on new type', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      D.n = 1
      Dynamic._setInnerType(D, class B { })
      expect(D.n).to.equal(undefined)
    })

    it('cannot set prototype', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => { D.prototype = 123 }).to.throw()
      expect(D.prototype).not.to.equal(123)
      expect(A.prototype).not.to.equal(123)
    })

    it('cannot set toString', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      expect(() => { D.toString = 123 }).to.throw()
      expect(D.toString).not.to.equal(123)
    })
  })

  describe('setPrototypeOf', () => {
    it('change prototype', () => {
      const D = new Dynamic()
      class A { }
      class B { }
      Dynamic._setInnerType(D, A)
      Object.setPrototypeOf(D, B)
      expect(Object.getPrototypeOf(D)).to.equal(B)
    })
  })

  describe('instance', () => {
    it('is instanceof dynamic type', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const d = new D()
      expect(d instanceof D).to.equal(true)
    })

    it('passes args', () => {
      const D = new Dynamic()
      class A { constructor (x) { this.x = x } }
      Dynamic._setInnerType(D, A)
      const d = new D(1)
      expect(d.x).to.equal(1)
    })

    it('is not instance of inner type', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      const d = new D()
      expect(d instanceof A).to.equal(false)
    })

    it('has same prototype as dynamic', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const d = new D()
      expect(Object.getPrototypeOf(d)).to.equal(D.prototype)
    })

    it('can change methods on instance', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { f () { } })
      const d = new D()
      Dynamic._setInnerType(D, class A { g () { } })
      expect(typeof d.f).to.equal('undefined')
      expect(typeof d.g).to.equal('function')
    })

    it('has same constructor as dynamic', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A { })
      const d = new D()
      expect(d.constructor).to.equal(D)
    })

    it('has same constructor as dynamic after type change', () => {
      const D = new Dynamic()
      Dynamic._setInnerType(D, class A {})
      const d = new D()
      Dynamic._setInnerType(D, class B {})
      expect(d.constructor).to.equal(D)
    })

    it('can set dynamic class properties', () => {
      const D = new Dynamic()
      class A { f () { this.constructor.n = 1 } }
      Dynamic._setInnerType(D, A)
      const d = new D()
      d.f()
      expect(D.n).to.equal(1)
    })

    it('can call methods that set on instance', () => {
      const D = new Dynamic()
      class A { f () { this.n = 1 } }
      Dynamic._setInnerType(D, A)
      const d = new D()
      d.f()
      expect(d.n).to.equal(1)
    })

    it('can call methods that define properties on instance', () => {
      const D = new Dynamic()
      class A { f () { Object.defineProperty(this, 'n', { value: 1 }) } }
      Dynamic._setInnerType(D, A)
      const d = new D()
      d.f()
      expect(d.n).to.equal(1)
    })

    it('can call methods that delete on instance', () => {
      const D = new Dynamic()
      class A { f () { delete this.n } }
      Dynamic._setInnerType(D, A)
      const d = new D()
      d.n = 1
      expect(d.n).to.equal(1)
      d.f()
      expect(d.n).to.equal(undefined)
    })
  })

  describe('extends', () => {
    it('can call instance methods that set', () => {
      const DA = new Dynamic()
      class A { f () { this.n = 1 } }
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      class B extends DA { g () { this.m = 2 } }
      Dynamic._setInnerType(DB, B)
      const b = new DB()
      b.f()
      b.g()
      expect(b.n).to.equal(1)
      expect(b.m).to.equal(2)
    })

    it('cannot change prototypes', () => {
      const DA = new Dynamic()
      class A { }
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      class B extends DA { }
      Dynamic._setInnerType(DB, B)
      expect(() => { Object.getPrototypeOf(DA.prototype).x = 1 }).to.throw()
      expect(Object.getPrototypeOf(DA.prototype).x).to.equal(undefined)
      expect(() => { Object.getPrototypeOf(DB.prototype).y = 2 }).to.throw()
      expect(Object.getPrototypeOf(DB.prototype).y).to.equal(undefined)
    })

    it('instances are from both child and parent class', () => {
      const DA = new Dynamic()
      class A { f () { this.n = 1 } }
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      class B extends DA { g () { this.m = 2 }}
      Dynamic._setInnerType(DB, B)
      const b = new DB()
      expect(b instanceof DB).to.equal(true)
      expect(b instanceof DA).to.equal(true)
    })

    it('toString is correct for dynamic children', () => {
      const DA = new Dynamic()
      class A { }
      Dynamic._setInnerType(DA, A)
      const DB = new Dynamic()
      class B extends DA { }
      Dynamic._setInnerType(DB, B)
      const DC = new Dynamic()
      class C extends DA { }
      Dynamic._setInnerType(DC, C)
      expect(DA.toString().startsWith('class A')).to.equal(true)
      expect(DB.toString().startsWith('class B')).to.equal(true)
      expect(DC.toString().startsWith('class C')).to.equal(true)
    })

    it('toString is correct for non-dynamic child of dynamic proxy', () => {
      const DA = new Dynamic()
      class A { }
      Dynamic._setInnerType(DA, A)
      const PA = new Proxy(DA, {})
      Dynamic._setOuterType(DA, PA)
      class B extends PA { }
      expect(B.toString().startsWith('class B')).to.equal(true)
    })

    it('can construct class that is not a dynamic', () => {
      const DA = new Dynamic()
      class A { }
      Dynamic._setInnerType(DA, A)
      class B extends DA { }
      const b = new B()
      expect(b.constructor).to.equal(B)
      expect(Object.getPrototypeOf(b.constructor)).to.equal(DA)
    })

    it('super works with changed class', () => {
      const DA = new Dynamic()
      const DB = new Dynamic()
      const DC = new Dynamic()

      class A { f () { return 'A' } }
      class B { f () { return 'B' } }
      Dynamic._setInnerType(DA, A)
      Dynamic._setInnerType(DB, B)

      class C extends DA { f () { return super.f() } }
      Dynamic._setInnerType(DC, C)

      const c = new DC()
      expect(c.f()).to.equal('A')

      _sudo(() => {
        Reflect.setPrototypeOf(DC, DB)
        Reflect.setPrototypeOf(Object.getPrototypeOf(DC.prototype), DB.prototype)
      })

      expect(c.f()).to.equal('B')
    })
  })

  describe('proxy', () => {
    it('may wrap to add additional behavior', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      const P = new Proxy(D, {
        set (target, prop, value, receiver) {
          if (prop === 'n') throw new Error()
          target[prop] = value
          return true
        },
        get (target, prop, receiver) {
          if (prop === 'm') return 2
          return target[prop]
        }
      })
      expect(() => { P.n = 1 }).to.throw()
      expect(P.m).to.equal(2)
      expect(() => Dynamic._setInnerType(P, class C { })).to.throw()
    })

    it('may set inner type to proxy', () => {
      const D = new Dynamic()
      const P = new Proxy(class A { }, {
        get (target, prop, receiver) {
          if (prop === 'toString') return () => target.toString()
          return target[prop]
        },
        set (target, prop, value, receiver) {
          target[prop] = prop === 'n' ? 2 : value
          return true
        }
      })
      Dynamic._setInnerType(D, P)
      D.n = 1
      expect(D.n).to.equal(2)
    })
  })

  describe('_getOuterType', () => {
    it('initially returns dynamic', () => {
      const D = new Dynamic()
      expect(Dynamic._getOuterType(D)).to.equal(D)
    })

    it('returns changed outer type', () => {
      const D = new Dynamic()
      const P = new Proxy(D, {})
      Dynamic._setOuterType(D, P)
      expect(Dynamic._getOuterType(D)).to.equal(P)
    })
  })

  describe('_setOuterType', () => {
    it('changes prototype constructor', () => {
      const D = new Dynamic()
      const P = new Proxy(D, {})
      Dynamic._setOuterType(D, P)
      expect(D.prototype.constructor).to.equal(P)
    })

    it('changes instance constructor', () => {
      const D = new Dynamic()
      const P = new Proxy(D, {})
      Dynamic._setOuterType(D, P)
      const p = new P()
      expect(p.constructor).to.equal(P)
    })

    it('calls toString on inner type', () => {
      const D = new Dynamic()
      const P = new Proxy(D, {})
      class A { }
      Dynamic._setInnerType(D, A)
      Dynamic._setOuterType(D, P)
      expect(P.toString()).to.equal(A.toString())
    })

    it('can set multiple times', () => {
      const D = new Dynamic()
      class A { }
      Dynamic._setInnerType(D, A)
      const P1 = new Proxy(D, { })
      Dynamic._setOuterType(D, P1)
      expect(Dynamic._getOuterType(D)).to.equal(P1)
      const P2 = new Proxy(D, { })
      Dynamic._setOuterType(D, P2)
      expect(Dynamic._getOuterType(D)).to.equal(P2)
    })
  })
})

// ------------------------------------------------------------------------------------------------
