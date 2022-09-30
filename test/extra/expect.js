/**
 * expect.js
 *
 * Tests for lib/extra/expect.js
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig } = Run
const unmangle = require('../env/unmangle')
const { createTestExtrasRun } = require('../env/misc')
const SI = unmangle(unmangle(Run)._Sandbox)._intrinsics

// ------------------------------------------------------------------------------------------------
// expect
// ------------------------------------------------------------------------------------------------

describe('expect', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------

  it('toBe', async () => {
    expect(() => Run.extra.expect(1).toBe(1)).not.to.throw()
    expect(() => Run.extra.expect('hello').toBe('hello')).not.to.throw()
    expect(() => Run.extra.expect(null).toBe(null)).not.to.throw()
    expect(() => Run.extra.expect({}).toBe({})).to.throw('expected value to be {} but was {}')
    expect(() => Run.extra.expect(1).not.toBe(2)).not.to.throw()
    expect(() => Run.extra.expect({}).not.toBe({})).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBe(null)).to.throw('expected value not to be null but was null')
    await createTestExtrasRun()
    class A extends Jig { }
    const a = new A() // an un-synced jig
    expect(() => Run.extra.expect(a).toBe(a)).not.to.throw()
    expect(() => Run.extra.expect(a).toBe(null)).to.throw()
  })

  // --------------------------------------------------------------------------

  it('toEqual', () => {
    expect(() => Run.extra.expect(1).toEqual(1)).not.to.throw()
    expect(() => Run.extra.expect(true).toEqual(true)).not.to.throw()
    expect(() => Run.extra.expect(1).not.toEqual('abc')).not.to.throw()
    expect(() => Run.extra.expect({}).not.toEqual(null)).not.to.throw()
    expect(() => Run.extra.expect({}).toEqual({})).not.to.throw()
    expect(() => Run.extra.expect({ a: [1] }).toEqual({ a: [1] })).not.to.throw()
    expect(() => Run.extra.expect([1, '2', { n: 3 }]).toEqual([1, '2', { n: 3 }])).not.to.throw()
    expect(() => Run.extra.expect([1]).toEqual([2])).to.throw('expected value to be equal to [2] but was [1]')
    class A { }
    expect(() => Run.extra.expect(new A()).toEqual(new A())).not.to.throw()
    expect(() => Run.extra.expect(new A()).toEqual({ })).to.throw('expected value to be equal to {} but was {}')
    expect(() => Run.extra.expect(new A()).not.toEqual(new (class A { })())).not.to.throw()
    expect(() => Run.extra.expect({ a: 1 }).not.toEqual({ a: 2 })).not.to.throw()
    expect(() => Run.extra.expect(new SI.Set([1, {}])).toEqual(new SI.Set([1, {}]))).not.to.throw()
    expect(() => Run.extra.expect(new SI.Set([1])).not.toEqual(new SI.Set([1, 2]))).not.to.throw()
    expect(() => Run.extra.expect(new SI.Set([1])).not.toEqual(new SI.Set([2]))).not.to.throw()
    expect(() => Run.extra.expect(new SI.Map([['a', new SI.Set()]])).toEqual(new SI.Map([['a', new SI.Set()]]))).not.to.throw()
    expect(() => Run.extra.expect(new SI.Map([['a', 'b']])).not.toEqual(new SI.Map([['a', 'c']]))).not.to.throw()
    expect(() => Run.extra.expect(new SI.Map([['a', 'b']])).not.toEqual(new SI.Map([]))).not.to.throw()
    const s1 = new SI.Set()
    s1.x = 1
    const s2 = new SI.Set()
    s1.x = 2
    expect(() => Run.extra.expect(s1).not.toEqual(s2)).not.to.throw()
    expect(() => Run.extra.expect(new SI.Uint8Array([1])).toEqual(new SI.Uint8Array([1]))).not.to.throw()
  })

  // --------------------------------------------------------------------------

  it('toBeInstanceOf', () => {
    class A {}
    class B extends A {}
    expect(() => Run.extra.expect(new A()).toBeInstanceOf(A)).not.to.throw()
    expect(() => Run.extra.expect(new B()).toBeInstanceOf(B)).not.to.throw()
    expect(() => Run.extra.expect(new B()).toBeInstanceOf(A)).not.to.throw()
    expect(() => Run.extra.expect([]).toBeInstanceOf(Array)).not.to.throw()
    expect(() => Run.extra.expect(1).toBeInstanceOf(A)).to.throw('expected value to be an instance of A but was 1')
    expect(() => Run.extra.expect(new A()).not.toBeInstanceOf(B)).not.to.throw()
    expect(() => Run.extra.expect(new A()).not.toBeInstanceOf(A)).to.throw('expected value not to be an instance of A but was {}')
  })

  // --------------------------------------------------------------------------

  it('toBeDefined', () => {
    expect(() => Run.extra.expect(1).toBeDefined()).not.to.throw()
    expect(() => Run.extra.expect(undefined).toBeDefined()).to.throw('expected value to be defined but was undefined')
    expect(() => Run.extra.expect().not.toBeDefined()).not.to.throw()
    expect(() => Run.extra.expect(undefined).not.toBeDefined()).not.to.throw()
    expect(() => Run.extra.expect(0).not.toBeDefined()).to.throw('expected value not to be defined but was 0')
  })

  // --------------------------------------------------------------------------

  it('toBeNull', () => {
    expect(() => Run.extra.expect(null).toBeNull()).not.to.throw()
    expect(() => Run.extra.expect(0).toBeNull()).to.throw('expected value to be null but was 0')
    expect(() => Run.extra.expect(false).not.toBeNull()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeNull()).to.throw('expected value not to be null but was null')
  })

  // --------------------------------------------------------------------------

  it('toBeNumber', () => {
    expect(() => Run.extra.expect(0).toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(5).toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(1.1).toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(NaN).toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(Infinity).toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(false).toBeNumber()).to.throw('expected value to be a number but was false')
    expect(() => Run.extra.expect('0').toBeNumber('bad argument')).to.throw('bad argument')
    expect(() => Run.extra.expect('hello').not.toBeNumber()).not.to.throw()
    expect(() => Run.extra.expect(5).not.toBeNumber()).to.throw('expected value not to be a number but was 5')
  })

  // --------------------------------------------------------------------------

  it('toBeInteger', () => {
    expect(() => Run.extra.expect(0).toBeInteger()).not.to.throw()
    expect(() => Run.extra.expect(1).toBeInteger()).not.to.throw()
    expect(() => Run.extra.expect(1.1).toBeInteger()).to.throw('expected value to be an integer but was 1.1')
    expect(() => Run.extra.expect(NaN).toBeInteger()).to.throw('expected value to be an integer but was NaN')
    expect(() => Run.extra.expect(false).toBeInteger()).to.throw('expected value to be an integer but was false')
    expect(() => Run.extra.expect('hello').not.toBeInteger()).not.to.throw()
    expect(() => Run.extra.expect(5).not.toBeInteger()).to.throw('expected value not to be an integer but was 5')
  })

  // --------------------------------------------------------------------------

  it('toBeLessThan', () => {
    expect(() => Run.extra.expect(0).toBeLessThan(1)).not.to.throw()
    expect(() => Run.extra.expect(-1.2).toBeLessThan(-1.1)).not.to.throw()
    expect(() => Run.extra.expect(false).toBeLessThan(0)).to.throw('expected value to be less than 0 but was false')
    expect(() => Run.extra.expect(0).not.toBeLessThan(0)).not.to.throw()
    expect(() => Run.extra.expect(-1).not.toBeLessThan(0)).to.throw('expected value not to be less than 0 but was -1')
  })

  // --------------------------------------------------------------------------

  it('toBeLessThanOrEqualTo', () => {
    expect(() => Run.extra.expect(1).toBeLessThanOrEqualTo(1)).not.to.throw()
    expect(() => Run.extra.expect(-1.2).toBeLessThanOrEqualTo(-1.1)).not.to.throw()
    expect(() => Run.extra.expect(false).toBeLessThanOrEqualTo(0)).to.throw('expected value to be less than or equal to 0 but was false')
    expect(() => Run.extra.expect(1).not.toBeLessThanOrEqualTo(0)).not.to.throw()
    expect(() => Run.extra.expect(0).not.toBeLessThanOrEqualTo(0)).to.throw('expected value not to be less than or equal to 0 but was 0')
  })

  // --------------------------------------------------------------------------

  it('toBeGreaterThan', () => {
    expect(() => Run.extra.expect(1).toBeGreaterThan(0)).not.to.throw()
    expect(() => Run.extra.expect(-1.1).toBeGreaterThan(-1.2)).not.to.throw()
    expect(() => Run.extra.expect(false).toBeGreaterThan(0)).to.throw('expected value to be greater than 0 but was false')
    expect(() => Run.extra.expect(0).not.toBeGreaterThan(0)).not.to.throw()
    expect(() => Run.extra.expect(0).not.toBeGreaterThan(-1)).to.throw('expected value not to be greater than -1 but was 0')
  })

  // --------------------------------------------------------------------------

  it('toBeGreaterThanOrEqualTo', () => {
    expect(() => Run.extra.expect(1).toBeGreaterThanOrEqualTo(1)).not.to.throw()
    expect(() => Run.extra.expect(-1.1).toBeGreaterThanOrEqualTo(-1.2)).not.to.throw()
    expect(() => Run.extra.expect(false).toBeGreaterThanOrEqualTo(0)).to.throw('expected value to be greater than or equal to 0 but was false')
    expect(() => Run.extra.expect(0).not.toBeGreaterThanOrEqualTo(1)).not.to.throw()
    expect(() => Run.extra.expect(0).not.toBeGreaterThanOrEqualTo(0)).to.throw('expected value not to be greater than or equal to 0 but was 0')
  })

  // --------------------------------------------------------------------------

  it('toBeBoolean', () => {
    expect(() => Run.extra.expect(true).toBeBoolean()).not.to.throw()
    expect(() => Run.extra.expect(1).toBeBoolean()).to.throw('expected value to be a boolean but was 1')
    expect(() => Run.extra.expect('true').not.toBeBoolean()).not.to.throw()
    expect(() => Run.extra.expect(false).not.toBeBoolean()).to.throw('expected value not to be a boolean but was false')
  })

  // --------------------------------------------------------------------------

  it('toBeString', () => {
    expect(() => Run.extra.expect('hello').toBeString()).not.to.throw()
    expect(() => Run.extra.expect(true).toBeString()).to.throw('expected value to be a string but was true')
    expect(() => Run.extra.expect(1).not.toBeString()).not.to.throw()
    expect(() => Run.extra.expect('hello').not.toBeString()).to.throw('expected value not to be a string but was hello')
  })

  // --------------------------------------------------------------------------

  it('toBeObject', () => {
    expect(() => Run.extra.expect({}).toBeObject()).not.to.throw()
    expect(() => Run.extra.expect([1, 2, 3]).toBeObject()).not.to.throw()
    expect(() => Run.extra.expect(null).toBeObject()).to.throw('expected value to be an object but was null')
    expect(() => Run.extra.expect(true).toBeObject()).to.throw('expected value to be an object but was true')
    expect(() => Run.extra.expect(1).not.toBeObject()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeObject()).not.to.throw()
    expect(() => Run.extra.expect({}).not.toBeObject()).to.throw('expected value not to be an object but was {}')
  })

  // --------------------------------------------------------------------------

  it('toBeArray', () => {
    expect(() => Run.extra.expect([]).toBeArray()).not.to.throw()
    expect(() => Run.extra.expect(new Array(1)).toBeArray()).not.to.throw()
    expect(() => Run.extra.expect({}).toBeArray()).to.throw('expected value to be an array but was {}')
    expect(() => Run.extra.expect(1).not.toBeArray()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeArray()).not.to.throw()
    expect(() => Run.extra.expect([1, 2]).not.toBeArray()).to.throw('expected value not to be an array but was [1,2]')
  })

  // --------------------------------------------------------------------------

  it('toBeSet', () => {
    expect(() => Run.extra.expect(new SI.Set()).toBeSet()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Set([1])).toBeSet()).not.to.throw()
    expect(() => Run.extra.expect({}).toBeSet()).to.throw('expected value to be a set but was {}')
    expect(() => Run.extra.expect(1).not.toBeSet()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeSet()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Set()).not.toBeSet()).to.throw('expected value not to be a set but was {}')
  })

  // --------------------------------------------------------------------------

  it('toBeMap', () => {
    expect(() => Run.extra.expect(new SI.Map()).toBeMap()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Map([[1, 2]])).toBeMap()).not.to.throw()
    expect(() => Run.extra.expect({}).toBeMap()).to.throw('expected value to be a map but was {}')
    expect(() => Run.extra.expect(1).not.toBeMap()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeMap()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Map()).not.toBeMap()).to.throw('expected value not to be a map but was {}')
  })

  // --------------------------------------------------------------------------

  it('toBeUint8Array', () => {
    expect(() => Run.extra.expect(new SI.Uint8Array()).toBeUint8Array()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Uint8Array([1])).toBeUint8Array()).not.to.throw()
    expect(() => Run.extra.expect({}).toBeUint8Array()).to.throw('expected value to be a uint8array but was {}')
    expect(() => Run.extra.expect(1).not.toBeUint8Array()).not.to.throw()
    expect(() => Run.extra.expect(null).not.toBeUint8Array()).not.to.throw()
    expect(() => Run.extra.expect(new SI.Uint8Array()).not.toBeUint8Array()).to.throw('expected value not to be a uint8array but was {}')
  })

  // --------------------------------------------------------------------------

  it('toBeClass', () => {
    expect(() => Run.extra.expect(class A {}).toBeClass()).not.to.throw()
    expect(() => Run.extra.expect(class {}).toBeClass()).not.to.throw()
    expect(() => Run.extra.expect(function f () {}).toBeClass()).to.throw('expected value to be a class but was')
    expect(() => Run.extra.expect(() => {}).toBeClass()).to.throw('expected value to be a class but was')
    expect(() => Run.extra.expect({}).not.toBeClass()).not.to.throw()
    expect(() => Run.extra.expect(class A {}).not.toBeClass()).to.throw('expected value not to be a class but was')
    expect(() => Run.extra.expect(class A extends Jig {}).toBeClass()).not.to.throw()
  })

  // --------------------------------------------------------------------------

  it('toBeFunction', () => {
    expect(() => Run.extra.expect(function f () {}).toBeFunction()).not.to.throw()
    expect(() => Run.extra.expect(() => {}).toBeFunction()).not.to.throw()
    expect(() => Run.extra.expect(class A {}).toBeFunction()).to.throw('expected value to be a function but was class A {}')
    expect(() => Run.extra.expect(class {}).toBeFunction()).to.throw('expected value to be a function but was class {}')
    expect(() => Run.extra.expect([]).not.toBeFunction()).not.to.throw()
    expect(() => Run.extra.expect(() => {}).not.toBeFunction()).to.throw('expected value not to be a function but was () => {}')
  })

  // --------------------------------------------------------------------------

  it('toBeJigClass', () => {
    new Run() // eslint-disable-line
    class A extends Jig { }
    expect(() => Run.extra.expect(A).toBeJigClass()).not.to.throw()
    expect(() => Run.extra.expect(class B extends A {}).toBeJigClass()).not.to.throw()
    expect(() => Run.extra.expect(class A {}).toBeJigClass()).to.throw('expected value to be a jig class but was class A {}')
    expect(() => Run.extra.expect(null).toBeJigClass()).to.throw()
    expect(() => Run.extra.expect(undefined).toBeJigClass()).to.throw()
    expect(() => Run.extra.expect(new A()).toBeJigClass()).to.throw()
  })

  // --------------------------------------------------------------------------

  it('toExtendFrom', () => {
    class A extends Jig { }
    expect(() => Run.extra.expect(A).toExtendFrom(Jig)).not.to.throw()
    expect(() => Run.extra.expect(A).toExtendFrom(class B {})).to.throw('expected value to be an extension of B but was class A extends Jig { }')
    expect(() => Run.extra.expect(A).not.toExtendFrom(class B { })).not.to.throw()
    expect(() => Run.extra.expect(A).not.toExtendFrom(null)).not.to.throw()
    expect(() => Run.extra.expect().not.toExtendFrom(A)).not.to.throw()
    expect(() => Run.extra.expect(class B extends A { }).not.toExtendFrom(A)).to.throw('expected value not to be an extension of A but was class B extends A { }')
  })
})

// ------------------------------------------------------------------------------------------------
