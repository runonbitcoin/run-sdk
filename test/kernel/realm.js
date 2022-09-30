/**
 * realm.js
 *
 * Tests for lib/kernel/realm.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const DeterministicRealm = unmangle(Run)._DeterministicRealm
const { BROWSER } = require('../env/config')
const { Jig } = Run

// ------------------------------------------------------------------------------------------------
// DeterministicRealm
// ------------------------------------------------------------------------------------------------

describe('DeterministicRealm', () => {
  // --------------------------------------------------------------------------
  // evaluate
  // --------------------------------------------------------------------------

  describe('evaluate', () => {
    it('should pass simple evaluations', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('1 + 1')).to.equal(2)
      expect(c.evaluate('"abc"')).to.equal('abc')
      expect(c.evaluate('null')).to.equal(null)
      expect(c.evaluate('')).to.equal(undefined)
      expect(c.evaluate('[1, 2, 3].filter(x => x < 3)')).to.deep.equal([1, 2])
      expect(typeof c.evaluate('function f() {}; f')).to.equal('function')
    })

    // ------------------------------------------------------------------------

    it('should throw if code is not a string', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(() => c.evaluate()).to.throw()
      expect(() => c.evaluate(1)).to.throw()
      expect(() => c.evaluate(function f () {})).to.throw()
    })

    // ------------------------------------------------------------------------

    it('should use strict mode', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('function strict() { return !this; }; strict()')).to.equal(true)
      expect(() => c.evaluate('function f() { x = 1 }; f()')).to.throw()
      expect(() => c.evaluate('x = 2')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('cannot access setup vars', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('typeof SES')).to.equal('undefined')
      expect(c.evaluate('typeof Compartment')).to.equal('undefined')
      expect(c.evaluate('typeof m')).to.equal('undefined')
      expect(c.evaluate('typeof n')).to.equal('undefined')
      expect(() => c.evaluate('n = 1')).to.throw()
      expect(() => c.evaluate('m = 1')).to.throw()
      expect(() => c.evaluate('SES = 1')).to.throw()
      expect(() => c.evaluate('Compartment = 1')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('should support setting globals', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(() => c.evaluate('x')).to.throw()
      c.global.x = 1
      expect(c.evaluate('x')).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('should support deleting globals', () => {
      const c = new DeterministicRealm().makeCompartment()
      c.global.a = [1, 2, 3]
      c.global.Math = class {}
      expect(c.evaluate('a')).to.deep.equal([1, 2, 3])
      delete c.global.a
      delete c.global.Math
      expect(() => c.evaluate('a')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('should throw if evaluated code throws', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(() => c.evaluate('throw new Error()')).to.throw()
      expect(() => c.evaluate('x.y = z')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('should supporting lazily setting dependencies', () => {
      const c = new DeterministicRealm().makeCompartment()
      const f = c.evaluate('function f() { return z }; f')
      c.global.z = 1
      expect(f()).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('should support global getters', () => {
      const c = new DeterministicRealm().makeCompartment()
      Object.defineProperty(c.global, 'z', { get: () => true })
      expect(c.evaluate('z')).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // compartments
  // --------------------------------------------------------------------------

  describe('Compartments', () => {
    it('should support extending classes in different compartments', () => {
      const realm = new DeterministicRealm()
      const c1 = realm.makeCompartment()
      const c2 = realm.makeCompartment()
      const A = c1.evaluate('class A {}; A')
      c2.global.A = A
      c2.evaluate('class B extends A {}')
    })

    // ------------------------------------------------------------------------

    it('same realm same intrinsics', () => {
      const realm = new DeterministicRealm()
      const c1 = realm.makeCompartment()
      const c2 = realm.makeCompartment()
      expect(c1.evaluate('Object')).to.equal(c2.evaluate('Object'))
      expect(c1.evaluate('RegExp')).to.equal(c2.evaluate('RegExp'))
    })

    // ------------------------------------------------------------------------

    it('different realm different intrinsics', () => {
      const c1 = new DeterministicRealm().makeCompartment()
      const c2 = new DeterministicRealm().makeCompartment()
      expect(c1.evaluate('String')).not.to.equal(c2.evaluate('String'))
      expect(c1.evaluate('Array')).not.to.equal(c2.evaluate('Array'))
    })

    // ------------------------------------------------------------------------

    it('should separate globals across compartments', () => {
      const c1 = new DeterministicRealm().makeCompartment()
      const c2 = new DeterministicRealm().makeCompartment()
      c1.global.x = 1
      c2.global.y = 2
      expect(c1.evaluate('x === 1 && typeof y === \'undefined\'')).to.equal(true)
      expect(c2.evaluate('y === 2 && typeof x === \'undefined\'')).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // determinism
  // --------------------------------------------------------------------------

  describe('determinism', () => {
    it('should have its own environment', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('typeof process')).to.equal('undefined')
      expect(c.evaluate('typeof global')).to.equal('undefined')
      expect(c.evaluate('typeof window')).to.equal('undefined')
      expect(c.evaluate('typeof document')).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('should have its own intrinsics', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(Array === c.evaluate('Array')).to.equal(false)
      expect(Object === c.evaluate('Object')).to.equal(false)
      expect(String === c.evaluate('String')).to.equal(false)
      expect(Function === c.evaluate('Function')).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('should reuse intrinsics across evaluations', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('Array')).to.equal(c.evaluate('Array'))
    })

    // ------------------------------------------------------------------------

    it('should disable non-deterministic intrinsics', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('typeof Math')).to.equal('undefined')
      expect(c.evaluate('typeof setTimeout')).to.equal('undefined')
      expect(c.evaluate('typeof Date')).to.equal('undefined')
      expect(c.evaluate('typeof eval')).to.equal('undefined')
      expect(c.evaluate('typeof String.prototype.localeCompare')).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('should have frozen intrinsics', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('Object.isFrozen(RegExp)')).to.equal(true)
      expect(c.evaluate('Object.isFrozen(Number)')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('should return the same source code', () => {
      const c = new DeterministicRealm().makeCompartment()
      const methodCode1 = 'f() { return 1 }'
      const methodCode2 = 'g() {\nreturn     1 \n }'
      const classCode = `class A { ${methodCode1} ${methodCode2} }`
      expect(c.evaluate(`${classCode}; A.toString()`)).to.equal('class A { f() { return 1 } g() {\nreturn     1 \n } }')
      expect(c.evaluate(`${classCode}; A.prototype.f.toString()`)).to.equal(`function ${methodCode1}`)
      expect(c.evaluate(`${classCode}; A.prototype.g.toString()`)).to.equal('function g() {\nreturn     1 \n }')
      const functionCode = 'function () { return "abc" }'
      expect(c.evaluate(`const f = ${functionCode}; f.toString()`)).to.equal(functionCode)
      const lambdaCode = '(a, b) => a.filter(b)'
      expect(c.evaluate(`const x = ${lambdaCode}; x.toString()`)).to.equal(lambdaCode)
    })

    // ------------------------------------------------------------------------

    it('should sort arrays stable', () => {
      const c = new DeterministicRealm().makeCompartment()
      const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
      const values = [1, 1, 0, 1, 2, 1, 1, 0, 1, 2, 1, 1, 0, 1, 2]
      const arr = indices.map((x, n) => { return { index: x, value: values[n] } })
      const stableSortedIndices = [2, 7, 12, 0, 1, 3, 5, 6, 8, 10, 11, 13, 4, 9, 14]
      c.global.arr = arr
      const sorted = c.evaluate('[...arr].sort((a,b) => a.value - b.value)')
      expect(sorted.map(x => x.index)).to.deep.equal(stableSortedIndices)
    })

    // ------------------------------------------------------------------------

    it('should sort arrays without comparison function', () => {
      const c = new DeterministicRealm().makeCompartment()
      c.global.arr = ['b', 'a']
      const sorted = c.evaluate('[...arr].sort()')
      expect(sorted).to.deep.equal(['a', 'b'])
    })

    // ------------------------------------------------------------------------

    it('should disable String.prototype.localeCompare', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('String.prototype.localeCompare')).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('should iterate over keys deterministically', () => {
      const c = new DeterministicRealm().makeCompartment()
      const setup = 'const o={};o[\'b\']=3;o[3]=2;o[\'_\']=4;o[\'a\']=5;o[2]=1'
      const test1 = `${setup};Object.keys(o)`
      const test2 = `${setup};Object.values(o)`
      const test3 = `${setup};Object.entries(o)`
      expect(c.evaluate(test1)).to.deep.equal(['2', '3', 'b', '_', 'a'])
      expect(c.evaluate(test2)).to.deep.equal([1, 2, 3, 4, 5])
      expect(c.evaluate(test3)).to.deep.equal([['2', 1], ['3', 2], ['b', 3], ['_', 4], ['a', 5]])
    })

    // ------------------------------------------------------------------------

    it('should support JSON.stringify', () => {
      const c = new DeterministicRealm().makeCompartment()
      const deterministicJSONStringify = c.evaluate('JSON.stringify')
      const testPass = (x, replacer, space) => {
        const expected = JSON.stringify(x, replacer, space)
        const actual = deterministicJSONStringify(x, replacer, space)
        expect(actual).to.equal(expected)
      }
      const testFail = (x, replacer, space) => {
        const error = 'Converting circular structure to JSON'
        expect(() => JSON.stringify(x, replacer, space)).to.throw()
        expect(() => deterministicJSONStringify(x, replacer, space)).to.throw(error)
      }
      function testCases (replacer, space) {
        // Primitives
        testPass(0, replacer, space)
        testPass(-1, replacer, space)
        testPass(Number.MIN_VALUE, replacer, space)
        testPass(Number.MAX_SAFE_INTEGER, replacer, space)
        testPass(-0, replacer, space)
        testPass(undefined, replacer, space)
        testPass('', replacer, space)
        testPass(true, replacer, space)
        testPass(false, replacer, space)
        // Objects
        testPass({ n: 1 }, replacer, space)
        testPass({ '': '' }, replacer, space)
        testPass({ a: { b: { } } }, replacer, space)
        // Arrays
        testPass([], replacer, space)
        testPass([1, 2, 3], replacer, space)
        testPass([[{}]], replacer, space)
        // Unsupported
        testPass(-Infinity, replacer, space)
        testPass(NaN, replacer, space)
        testPass(Symbol.hasInstance, replacer, space)
        testPass(new Set(), replacer, space)
        testPass(new Map(), replacer, space)
        // Duplicate
        const o = { }
        o.a = { }
        o.b = o.a
        testPass(o, replacer, space)
      }
      testCases()
      testCases(undefined, 0)
      testCases(undefined, 1)
      testCases(undefined, 3)
      // Replacer
      const r = { n: 1 }
      testPass(r, x => x === r ? { n: 2 } : x, 3)
      testPass([1, 2, 3], x => 123, 0)
      testPass([1, 2, 3], x => undefined, 0)
      // Circular
      const arr = []
      arr[0] = arr
      testFail(arr)
      const o = { }
      o.o = o
      testFail(o)
      // Bad param
      testPass([1, 2, 3], undefined, 'hello')
      testPass([1, 2, 3], undefined, () => { })
    })

    // ------------------------------------------------------------------------

    it('should throw if includes for-in loops', () => {
      const c = new DeterministicRealm().makeCompartment()
      const error = 'for-in loops are not supported'
      expect(() => c.evaluate('const y={};for(let x in y){}')).to.throw(error)
      expect(() => c.evaluate('const y={z:[]};for(const x in y.z){}')).to.throw(error)
      expect(() => c.evaluate('function o(){return{}};for(const x in o()){}')).to.throw(error)
      expect(() => c.evaluate('const o={};o[")}"]={};for(var x in o[")}"]){}')).to.throw(error)
      c.evaluate('const y=[];for (const x of y){}')
    })

    // ------------------------------------------------------------------------

    it('should hide override source code', () => {
      const c = new DeterministicRealm().makeCompartment()
      expect(c.evaluate('Array.prototype.sort.toString()')).to.equal('function sort() { [native code ] }')
      expect(c.evaluate('Object.keys.toString()')).to.equal('function keys() { [native code ] }')
      expect(c.evaluate('Object.values.toString()')).to.equal('function values() { [native code ] }')
      expect(c.evaluate('Object.entries.toString()')).to.equal('function entries() { [native code ] }')
      expect(c.evaluate('JSON.stringify.toString()')).to.equal('function stringify() { [native code ] }')
      expect(c.evaluate('Function.prototype.toString.toString()')).to.equal('function toString() { [native code ] }')
      expect(c.evaluate('Function.prototype.toString.toString.toString()')).to.equal('function toString() { [native code ] }')
    })
  })

  // --------------------------------------------------------------------------
  // Misc
  // --------------------------------------------------------------------------

  describe('Misc', () => {
    it('should log in admin mode', () => {
      new Run() // eslint-disable-line
      class A extends Jig { init () { console.log(this) } }
      new A() // eslint-disable-line
    })
  })

  // --------------------------------------------------------------------------
  // browser
  // --------------------------------------------------------------------------

  if (BROWSER) {
    const { JSDOM } = require('jsdom')

    describe('browser', () => {
      it('should create a hidden iframe', () => {
        const dom = new JSDOM('<!DOCTYPE html><html></html>', { runScripts: 'outside-only' })
        global.VARIANT = 'browser'
        global.document = dom.window.document
        new DeterministicRealm().makeCompartment() // eslint-disable-line
        expect(document.getElementsByTagName('iframe').length > 0).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('it should create a body if necessary', () => {
        const dom = new JSDOM('<!DOCTYPE html><html></html>', { runScripts: 'outside-only' })
        global.VARIANT = 'browser'
        global.document = dom.window.document
        document.body.parentNode.removeChild(document.body)
        expect(!document.body).to.equal(true)
        new DeterministicRealm().makeCompartment() // eslint-disable-line
        expect(!!document.body).to.equal(true)
      })
    })
  }
})

// ------------------------------------------------------------------------------------------------
