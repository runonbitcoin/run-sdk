/**
 * deploy.js
 *
 * Tests for deploying code
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { stub } = require('sinon')
const { expect } = require('chai')
const bsv = require('bsv')
const { PrivateKey } = bsv
const { sha256 } = bsv.crypto.Hash
const bsvBuffer = bsv.deps.Buffer
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { expectTx } = require('../env/misc')
const { Code, Jig, Berry } = Run
const { LocalCache } = Run.plugins
const { CommonLock } = Run.util
const SI = unmangle(unmangle(Run)._Sandbox)._intrinsics
const _sudo = unmangle(Run)._sudo

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const randomLocation = () => sha256(bsvBuffer.from(Math.random().toString()), 'utf8').toString('hex') + '_o0'
const randomOwner = () => new PrivateKey().toAddress().toString()

// ------------------------------------------------------------------------------------------------
// Code
// ------------------------------------------------------------------------------------------------

describe('Deploy', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Deploy
  // --------------------------------------------------------------------------

  describe('deploy', () => {
    it('basic class', async () => {
      const run = new Run()

      class A { }

      const test = CA => {
        expect(typeof CA).to.equal('function')
        expect(CA.toString()).to.equal(A.toString())
        expect(CA).not.to.equal(A)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              { deps: { } }
            ]
          }
        ]
      })

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

    it('basic function', async () => {
      const run = new Run()

      function f () { }

      const test = cf => {
        expect(typeof cf).to.equal('function')
        expect(cf.toString()).to.equal(f.toString())
        expect(cf).not.to.equal(f)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              f.toString(),
              { deps: { } }
            ]
          }
        ]
      })

      const cf = run.deploy(f)
      test(cf)

      await cf.sync()
      const cf2 = await run.load(cf.location)
      test(cf2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      test(cf3)
    })

    // ------------------------------------------------------------------------

    it('creates code for class only once', async () => {
      const run = new Run()
      class A { }
      const CA1 = run.deploy(A)
      const CA2 = run.deploy(A)
      expect(CA1 === CA2).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('creates code for function only once', () => {
      const run = new Run()
      function f () { }
      const cf1 = run.deploy(f)
      const cf2 = run.deploy(f)
      expect(cf1 === cf2).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns code for code', () => {
      const run = new Run()
      class A { }
      const CA1 = run.deploy(A)
      const CA2 = run.deploy(CA1)
      expect(CA1).to.equal(CA2)
    })

    // ------------------------------------------------------------------------

    it('more than 10 classes', async () => {
      const run = new Run()
      class A { }
      A.arr = []
      for (let i = 0; i < 10; i++) {
        class B { }
        B.n = i
        A.arr.push(B)
      }
      function test (CA) {
        for (let i = 0; i < 10; i++) {
          expect(CA.arr[i].n).to.equal(i)
        }
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

    it('custom owners', async () => {
      class CustomOwner {
        script () { return '' }
        domain () { return 1 }
      }
      const run = new Run({ owner: new CustomOwner() })
      class A { }
      run.deploy(A)
      await run.sync()
      expect(A.owner instanceof CustomOwner).to.equal(true)
      const A2 = await run.load(A.location)
      expect(A2.owner instanceof CustomOwner).to.equal(true)
      run.cache = new LocalCache()
      const A3 = await run.load(A.location)
      expect(A3.owner instanceof CustomOwner).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('queue up multiple', async () => {
      const run = new Run()
      class A { }
      class B { }
      run.deploy(A)
      run.deploy(B)
      await run.sync()
      expect(A.origin.slice(0, 64)).not.to.equal(B.origin.slice(0, 64))
      expect(A.location.slice(0, 64)).not.to.equal(B.location.slice(0, 64))
    })

    // ------------------------------------------------------------------------

    it('does not set metadata on local type until deployed', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      expect(A.origin).to.equal(undefined)
      expect(A.location).to.equal(undefined)
      expect(A.nonce).to.equal(undefined)
      expect(A.owner).to.equal(undefined)
      expect(A.satoshis).to.equal(undefined)
      expect(A.presets).to.equal(undefined)
    })
  })

  // --------------------------------------------------------------------------
  // Bindings
  // --------------------------------------------------------------------------

  describe('bindings', () => {
    it('sets initial bindings before sync', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      _sudo(() => {
        expect(CA.location.startsWith('record://')).to.equal(true)
        expect(CA.origin.startsWith('record://')).to.equal(true)
        expect(CA.nonce).to.equal(1)
        expect(CA.owner).to.equal(undefined)
        expect(CA.satoshis).to.equal(undefined)
      })
    })

    // ------------------------------------------------------------------------

    it('assigns bindings after sync', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await run.sync()
      expect(CA.location.endsWith('_o1')).to.equal(true)
      expect(CA.origin.endsWith('_o1')).to.equal(true)
      expect(CA.nonce).to.equal(1)
      const owner = await run.owner.nextOwner()
      expect(CA.owner).to.equal(owner)
      expect(CA.satoshis).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('assigns bindings to both local and jig', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await run.sync()
      expect(CA.location).to.equal(A.location)
      expect(CA.origin).to.equal(A.origin)
      expect(CA.nonce).to.equal(A.nonce)
      expect(CA.owner).to.equal(A.owner)
      expect(CA.satoshis).to.equal(A.satoshis)
    })

    // ------------------------------------------------------------------------

    it('throws if read before sync', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(() => CA.location).to.throw('Cannot read location')
      expect(() => CA.origin).to.throw('Cannot read origin')
      expect(() => CA.nonce).to.throw('Cannot read nonce')
      expect(() => CA.owner).to.throw('Cannot read owner')
      expect(() => CA.satoshis).to.throw('Cannot read satoshis')
      await CA.sync()
      expect(() => CA.location).not.to.throw()
      expect(() => CA.origin).not.to.throw()
      expect(() => CA.nonce).not.to.throw()
      expect(() => CA.owner).not.to.throw()
      expect(() => CA.satoshis).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('change props before deploy', async () => {
      const run = new Run()

      class A extends Jig { static f () { this.n = 1; this.o.m = 2 } }
      A.o = { }

      const CA = run.deploy(A)
      CA.f()
      await run.sync()

      const CA1 = await run.load(CA.origin)
      expect(CA1.n).to.equal(undefined)
      expect(CA1.o.m).to.equal(undefined)

      const CA2 = await run.load(CA.location)
      expect(CA2.n).to.equal(1)
      expect(CA2.o.m).to.equal(2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.origin)
      expect(CA3.n).to.equal(undefined)
      expect(CA3.o.m).to.equal(undefined)

      run.cache = new LocalCache()
      const CA4 = await run.load(CA.location)
      expect(CA4.n).to.equal(1)
      expect(CA4.o.m).to.equal(2)
    })
  })

  // --------------------------------------------------------------------------
  // Parents
  // --------------------------------------------------------------------------

  describe('parents', () => {
    it('deploys parent', async () => {
      const run = new Run()

      class A { }
      class B extends A { }

      const test = (CA, CB) => {
        expect(CA.location.endsWith('_o1')).to.equal(true)
        expect(CB.location.endsWith('_o2')).to.equal(true)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              { deps: { } },
              'class B extends A { }',
              {
                deps: {
                  A: { $jig: 0 }
                }
              }
            ]
          }
        ]
      })

      const CB = run.deploy(B)
      const CA = run.deploy(A)
      expect(Object.getPrototypeOf(CB)).to.equal(CA)

      await run.sync()
      test(CA, CB)

      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(CA2, CB2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(CA3, CB3)
    })

    // ------------------------------------------------------------------------

    it('parent chain', async () => {
      const run = new Run()

      class A { }
      class B extends A { }
      class C extends B { }

      function test (CC, CB, CA) {
        expect(Object.getPrototypeOf(CC).origin).to.equal(CB.origin)
        expect(Object.getPrototypeOf(CB).origin).to.equal(CA.origin)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 3,
        ndel: 0,
        ncre: 3,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              { deps: { } },
              'class B extends A { }',
              {
                deps: {
                  A: { $jig: 0 }
                }
              },
              'class C extends B { }',
              {
                deps: {
                  B: { $jig: 1 }
                }
              }
            ]
          }
        ]
      })

      const CC = run.deploy(C)
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      expect(Object.getPrototypeOf(CC)).to.equal(CB)
      expect(Object.getPrototypeOf(CB)).to.equal(CA)

      await run.sync()
      test(CC, CB, CA)

      const CC2 = await run.load(CC.location)
      const CB2 = await run.load(CB.location)
      const CA2 = await run.load(CA.location)
      test(CC2, CB2, CA2)

      run.cache = new LocalCache()
      const CC3 = await run.load(CC.location)
      const CB3 = await run.load(CB.location)
      const CA3 = await run.load(CA.location)
      test(CC3, CB3, CA3)
    })

    // ------------------------------------------------------------------------

    it('reuses installed code for parent', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B extends A { }
      const CB = run.deploy(B)
      expect(Object.getPrototypeOf(CB)).to.equal(CA)
    })

    // ------------------------------------------------------------------------

    it('reueses parent that is code', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B extends CA { }
      const CB = run.deploy(B)
      expect(Object.getPrototypeOf(CB)).to.equal(CA)
    })

    // ------------------------------------------------------------------------

    it('circular parent-child code', async () => {
      const run = new Run()

      class B { }
      class A extends B { }
      B.A = A

      function test (CA) {
        expect(Object.getPrototypeOf(CA).A).to.equal(CA)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class B { }',
              {
                A: { $jig: 1 },
                deps: { }
              },
              'class A extends B { }',
              {
                deps: {
                  B: { $jig: 0 }
                }
              }
            ]
          }
        ]
      })

      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(Object.getPrototypeOf(CA)).to.equal(CB)
      expect(CB.A).to.equal(CA)
      test(CA)

      await run.sync()

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('classes named Math and Date', async () => {
      const run = new Run()
      class Math { }
      const Math2 = run.deploy(Math)
      class Date { }
      const Date2 = run.deploy(Date)
      await run.sync()
      await run.load(Math2.location)
      await run.load(Date2.location)
      run.cache = new LocalCache()
      await run.load(Math2.location)
      await run.load(Date2.location)
    })
  })

  // --------------------------------------------------------------------------
  // Props
  // --------------------------------------------------------------------------

  describe('props', () => {
    async function runPropTest (props, encodedProps, testProps) {
      const run = new Run()

      class A { }
      Object.assign(A, props)

      props = Object.assign({ deps: { } }, props)
      encodedProps = Object.assign({ deps: { } }, encodedProps)

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              encodedProps
            ]
          }
        ]
      })

      function test (T) {
        const Tprops = _sudo(() => Object.assign({}, T))
        const bindings = ['location', 'origin', 'nonce', 'owner', 'satoshis']
        bindings.forEach(x => { delete Tprops[x] })

        expect(Tprops).to.deep.equal(props)

        if (testProps) testProps(T)
      }

      const CA = run.deploy(A)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    }

    // ------------------------------------------------------------------------

    it('booleans', async () => {
      const props = {
        falseValue: false,
        trueValue: true,
        container: { value: false },
        array: [true, false]
      }

      const encodedProps = {
        falseValue: false,
        trueValue: true,
        container: { value: false },
        array: [true, false]
      }

      await runPropTest(props, encodedProps)
    })

    // ------------------------------------------------------------------------

    it('undefined', async () => {
      const props = {
        undefinedValue: undefined,
        array: [undefined]
      }

      const encodedProps = {
        undefinedValue: { $und: 1 },
        array: [{ $und: 1 }]
      }

      await runPropTest(props, encodedProps)
    })

    // ------------------------------------------------------------------------

    it('numbers', async () => {
      const props = {
        zero: 0,
        pos: 1,
        neg: -1,
        float: 1.5,
        minInt: Number.MIN_SAFE_INTEGER,
        maxInt: Number.MAX_SAFE_INTEGER,
        minVal: Number.MIN_VALUE,
        maxVal: Number.MAX_VALUE,
        posInf: Number.POSITIVE_INFINITY,
        negInf: Number.NEGATIVE_INFINITY,
        nan: NaN,
        array: [1, -1, NaN, Infinity]
      }

      const encodedProps = {
        zero: 0,
        pos: 1,
        neg: -1,
        float: 1.5,
        minInt: Number.MIN_SAFE_INTEGER,
        maxInt: Number.MAX_SAFE_INTEGER,
        minVal: Number.MIN_VALUE,
        maxVal: Number.MAX_VALUE,
        posInf: { $inf: 1 },
        negInf: { $ninf: 1 },
        nan: { $nan: 1 },
        array: [1, -1, { $nan: 1 }, { $inf: 1 }]
      }

      await runPropTest(props, encodedProps)
    })

    // ------------------------------------------------------------------------

    it('strings', async () => {
      const props = {
        empty: '',
        short: 'abc',
        long: 'x'.repeat(10000),
        multiline: '0\n1\n2\n',
        emoji: '😄',
        obj: { arr: ['a'] }
      }

      const encodedProps = {
        empty: '',
        short: 'abc',
        long: 'x'.repeat(10000),
        multiline: '0\n1\n2\n',
        emoji: '😄',
        obj: { arr: ['a'] }
      }

      await runPropTest(props, encodedProps)
    })

    // ------------------------------------------------------------------------

    it('arrays', async () => {
      const sparse = []
      sparse[0] = 0
      sparse[99] = 99

      const complex = [1]
      complex.a = 'b'

      const props = {
        empty: [],
        basic: [1, 2, 3],
        nested: [[[]]],
        sparse,
        complex
      }

      const encodedProps = {
        empty: [],
        basic: [1, 2, 3],
        nested: [[[]]],
        sparse: { $arr: { 0: 0, 99: 99 } },
        complex: { $arr: { 0: 1, a: 'b' } }
      }

      function testProps (C) {
        expect(C.empty instanceof Array).to.equal(false)
        expect(C.empty instanceof SI.Array).to.equal(true)
      }

      await runPropTest(props, encodedProps, testProps)
    })

    // ------------------------------------------------------------------------

    it('objects', async () => {
      const props = {
        empty: {},
        basic: { a: 1, b: 2 },
        nested: { o: { } },
        array: [{}],
        nullValue: null,
        dollar: { $und: 1 }
      }

      const encodedProps = {
        empty: {},
        basic: { a: 1, b: 2 },
        nested: { o: { } },
        array: [{}],
        nullValue: null,
        dollar: { $obj: { $und: 1 } }
      }

      function testProps (C) {
        expect(C.empty instanceof Object).to.equal(false)
        expect(C.empty instanceof SI.Object).to.equal(true)
      }

      await runPropTest(props, encodedProps, testProps)
    })

    // ------------------------------------------------------------------------

    it('sets', async () => {
      const setWithProps = new Set()
      setWithProps.a = []
      setWithProps.s = new Set()

      const props = {
        empty: new Set(),
        basic: new Set([1, 2, 3]),
        nested: new Set([new Set()]),
        setWithProps
      }

      const encodedProps = {
        empty: { $set: [] },
        basic: { $set: [1, 2, 3] },
        nested: { $set: [{ $set: [] }] },
        setWithProps: { $set: [], props: { a: [], s: { $set: [] } } }
      }

      function testProps (C) {
        expect(C.empty instanceof Set).to.equal(false)
        expect(C.empty instanceof SI.Set).to.equal(true)
      }

      await runPropTest(props, encodedProps, testProps)
    })

    // ------------------------------------------------------------------------

    it('maps', async () => {
      const mapWithProps = new Map()
      mapWithProps.a = []
      mapWithProps.m = new Map()

      const props = {
        empty: new Map(),
        basic: new Map([[1, 2], [3, 4]]),
        complex: new Map([[new Set(), null], [[], {}]]),
        mapWithProps
      }

      const encodedProps = {
        empty: { $map: [] },
        basic: { $map: [[1, 2], [3, 4]] },
        complex: { $map: [[{ $set: [] }, null], [[], {}]] },
        mapWithProps: { $map: [], props: { a: [], m: { $map: [] } } }
      }

      function testProps (C) {
        expect(C.empty instanceof Map).to.equal(false)
        expect(C.empty instanceof SI.Map).to.equal(true)
      }

      await runPropTest(props, encodedProps, testProps)
    })

    // ------------------------------------------------------------------------

    it('uint8array', async () => {
      const props = {
        empty: new Uint8Array(),
        basic: new Uint8Array([0, 1, 255])
      }

      const encodedProps = {
        empty: { $ui8a: '' },
        basic: { $ui8a: 'AAH/' }
      }

      function testProps (C) {
        expect(C.empty instanceof Uint8Array).to.equal(false)
        expect(C.empty instanceof SI.Uint8Array).to.equal(true)
      }

      await runPropTest(props, encodedProps, testProps)
    })

    // ------------------------------------------------------------------------

    it('circular', async () => {
      const obj = {}
      obj.obj = obj

      const arr = []
      arr.push(arr)

      const props = { obj, arr }

      const encodedProps = { obj: { obj: { $dup: ['1', 'obj'] } }, arr: [{ $dup: ['1', 'arr'] }] }

      await runPropTest(props, encodedProps)
    })

    // ------------------------------------------------------------------------

    it('self-reference', async () => {
      const run = new Run()

      class A { }
      A.A = A

      const test = CA => {
        expect(CA.A).to.equal(CA)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              {
                A: { $jig: 0 },
                deps: { }
              }
            ]
          }
        ]
      })

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

    it('installs code props intact', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.CA = CA
      const CB = run.deploy(B)
      expect(CB.CA).to.equal(CA)
    })

    // ------------------------------------------------------------------------

    it('creates and deploys code props', async () => {
      const run = new Run()

      class A { }
      function f () { }
      class B { }
      A.f = f
      A.B = B

      expectTx({
        nin: 0,
        nref: 0,
        nout: 3,
        ndel: 0,
        ncre: 3,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              {
                B: { $jig: 1 },
                deps: { },
                f: { $jig: 2 }
              },
              B.toString(),
              { deps: { } },
              f.toString(),
              { deps: { } }
            ]
          }
        ]
      })

      const CA = run.deploy(A)

      await CA.sync()

      expect(CA.f).not.to.equal(f)
      expect(CA.f).to.equal(run.deploy(f))

      expect(CA.B).not.to.equal(B)
      expect(CA.B).to.equal(run.deploy(B))
    })

    // ------------------------------------------------------------------------

    it('code reference', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      function test (CB) {
        expect(CB.A.origin).to.equal(A.origin)
      }

      class B { }

      expectTx({
        nin: 0,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              B.toString(),
              { A: { $jig: 0 }, deps: { } }
            ]
          }
        ]
      })

      B.A = CA
      const CB = run.deploy(B)
      await CB.sync()
      test(CB)

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('circular code props', async () => {
      const run = new Run()

      class A { }
      class B { }
      A.B = B
      B.A = A

      function test (CA) {
        expect(CA.B.A).to.equal(CA)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              {
                B: { $jig: 1 },
                deps: { }
              },
              'class B { }',
              {
                A: { $jig: 0 },
                deps: { }
              }
            ]
          }
        ]
      })

      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CA.B).to.equal(CB)
      expect(CB.A).to.equal(CA)
      test(CA)

      await run.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('jigs', async () => {
      const run = new Run()

      class A extends Jig { }
      class B extends Jig { }

      const a = new A()
      await a.sync()
      B.A = A
      B.a = a

      function test (CB) {
        expect(CB.a instanceof Jig).to.equal(true)
        expect(CB.a.constructor).to.equal(CB.A)
      }

      expectTx({
        nin: 0,
        nref: 3,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              B.toString(),
              {
                A: { $jig: 0 },
                a: { $jig: 1 },
                deps: { Jig: { $jig: 2 } }
              }
            ]
          }
        ]
      })

      const CB = run.deploy(B)
      await CB.sync()
      test(CB)

      await run.sync()
      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('berries', async () => {
      const run = new Run()

      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await B.load('abc')

      class A extends Jig { }
      A.B = B
      A.b = b

      function test (CA) {
        expect(CA.B instanceof Code).to.equal(true)
        expect(CA.B.location).to.equal(CB.location)
        expect(CA.b instanceof Berry).to.equal(true)
        expect(CA.b.location).to.equal(b.location)
      }

      expectTx({
        nin: 0,
        nref: 3,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                B: { $jig: 0 },
                b: { $jig: 1 },
                deps: { Jig: { $jig: 2 } }
              }
            ]
          }
        ]
      })

      const CA = run.deploy(A)
      await CA.sync()
      test(CA)

      await run.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('native', async () => {
      const run = new Run()

      class A { }
      A.Jig = Jig
      A.Berry = Berry

      function test (CA) {
        expect(CA.Jig).to.equal(Jig)
        expect(CA.Berry).to.equal(Berry)
      }

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
              'class A { }',
              {
                Berry: { $jig: 0 },
                deps: { },
                Jig: { $jig: 1 }
              }
            ]
          }
        ]
      })

      const CA = run.deploy(A)
      await CA.sync()
      test(CA)

      await run.sync()
      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    function expectPropFail (x) {
      const run = new Run()
      class A { }
      A.x = x
      expect(() => run.deploy(A)).to.throw()
    }

    // ------------------------------------------------------------------------

    it('throws for symbols', () => {
      expectPropFail(Symbol.hasInstance)
      expectPropFail(Symbol.iterator)
    })

    // ------------------------------------------------------------------------

    it('throws for intrinsic props', () => {
      expectPropFail(Math)
      expectPropFail(Date)
      expectPropFail(isNaN)
      expectPropFail(Error)
    })

    // ------------------------------------------------------------------------

    it('throws for unsupported objects', () => {
      expectPropFail(new Date())
      expectPropFail(new Uint16Array())
      expectPropFail(Promise.resolve())
      expectPropFail(new WeakSet())
      expectPropFail(new WeakMap())
      expectPropFail(new RegExp())
      expectPropFail(/abc/)
      expectPropFail(new Error())
    })

    // ------------------------------------------------------------------------

    it('throws if extend intrinsics', () => {
      expectPropFail(new (class MyArray extends Array {})())
      expectPropFail(new (class MySet extends Set {})())
      expectPropFail(new (class MyMap extends Map {})())
      expectPropFail(new (class MyUint8Array extends Uint8Array {})())
    })

    // ------------------------------------------------------------------------

    it('throws for anonymous functions', () => {
      expectPropFail(function () { })
      expectPropFail(() => { })
      expectPropFail(class { })
    })

    // ------------------------------------------------------------------------

    it('sorts props deterministically', async () => {
      const run = new Run()
      class A { }
      A.b = 1
      A.a = 2
      A['0'] = 3
      A.o = { d: 5, c: 4 }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                0: 3,
                a: 2,
                b: 1,
                deps: { },
                o: { c: 4, d: 5 }
              }
            ]
          }
        ]
      })

      function test (CA) {
        const expected = ['0', 'a', 'b', 'deps', 'location', 'nonce', 'o', 'origin', 'owner', 'satoshis']
        expect(Object.keys(CA)).to.deep.equal(expected)
        expect(Object.keys(CA.o)).to.deep.equal(['c', 'd'])
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
  })

  // --------------------------------------------------------------------------
  // Deps
  // --------------------------------------------------------------------------

  describe('deps', () => {
    it('basic dep', async () => {
      const run = new Run()

      class A { }
      function f () { return A }
      f.deps = { A }

      function test (cf) {
        expect(cf() instanceof Code).to.equal(true)
        expect(cf.deps.A instanceof Code).to.equal(true)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              f.toString(),
              {
                deps: { A: { $jig: 1 } }
              },
              A.toString(),
              { deps: { } }
            ]
          }
        ]
      })

      const cf = run.deploy(f)
      await cf.sync()
      test(cf)

      const cf2 = await run.load(cf.location)
      test(cf2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      test(cf3)
    })

    // ------------------------------------------------------------------------

    it('non-code deps', async () => {
      const run = new Run()

      class A {
        static n () { return n } // eslint-disable-line
        static o () { return o } // eslint-disable-line
      }
      A.deps = { n: 1, o: { a: [] } }

      function test (CA) {
        expect(CA.n()).to.equal(1)
        expect(CA.o()).not.to.equal(A.deps.o)
        expect(CA.o()).to.deep.equal(A.deps.o)
        expect(CA.o() instanceof SI.Object).to.equal(true)
        expect(CA.o().a instanceof SI.Array).to.equal(true)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                deps: { n: 1, o: { a: [] } }
              }
            ]
          }
        ]
      })

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

    it('automatically adds parent', async () => {
      const run = new Run()

      class A { }
      class B extends A { }

      function test (CB) {
        expect(CB.deps.A instanceof Code).to.equal(true)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              { deps: { } },
              'class B extends A { }',
              {
                deps: { A: { $jig: 0 } }
              }
            ]
          }
        ]
      })

      const CB = run.deploy(B)
      test(CB)
      await CB.sync()

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('parent deps is not available on child', async () => {
      const run = new Run()

      class B { static f () { return n } } // eslint-disable-line
      class A extends B { static g () { return n } } // eslint-disable-line
      B.deps = { n: 1 }

      function test (CA) {
        expect(Object.getPrototypeOf(CA).f()).to.equal(1)
        expect(() => CA.g()).to.throw()
      }

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

    it('jig deps', async () => {
      const run = new Run()

      class A { static f () { return b } }
      class B extends Jig { }
      const b = new B()
      await b.sync()
      A.deps = { b }

      function test (CA) {
        expect(A.f()).to.equal(A.deps.b)
      }

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

    it('berry deps', async () => {
      const run = new Run()

      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await CB.load('abc')

      class A { static f () { return b } }
      A.deps = { b }

      function test (CA) {
        expect(A.f()).to.equal(A.deps.b)
        expect(A.f().location).to.equal(b.location)
      }

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

    it('native deps', async () => {
      const run = new Run()

      function f () { return [Jig, Berry] }
      f.deps = { Jig, Berry }

      function test (cf) {
        expect(cf()).to.deep.equal([Jig, Berry])
      }

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
              f.toString(),
              {
                deps: {
                  Berry: { $jig: 0 },
                  Jig: { $jig: 1 }
                }
              }
            ]
          }
        ]
      })

      const cf = run.deploy(f)
      test(cf)
      await cf.sync()

      const cf2 = await run.load(cf.location)
      test(cf2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      test(cf3)
    })

    // ------------------------------------------------------------------------

    it('throws if internal dep', async () => {
      const run = new Run()
      class A extends Jig { }
      A.deps = { CommonLock }
      run.deploy(A)
      const error = 'CommonLock is internal to RUN and cannot be deployed'
      await expect(run.sync()).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('code reference', async () => {
      const run = new Run()

      function f () { }
      const cf = run.deploy(f)
      await cf.sync()

      function test (cg) {
        expect(cg().origin).to.equal(cf.origin)
      }

      function g () { return f }

      expectTx({
        nin: 0,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              g.toString(),
              {
                deps: {
                  f: { $jig: 0 }
                }
              }
            ]
          }
        ]
      })

      g.deps = { f }
      const cg = await run.deploy(g)
      await cg.sync()
      test(cg)

      const cg2 = await run.load(cg.location)
      test(cg2)

      run.cache = new LocalCache()
      const cg3 = await run.load(cg.location)
      test(cg3)
    })

    // ------------------------------------------------------------------------

    it('renamed deps', async () => {
      const run = new Run()

      const h = 'dummy'
      function f () { return 1 }
      function g () { return h() }
      g.deps = { h: f }

      function test (cg) {
        expect(cg()).to.equal(1)
      }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 2,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              g.toString(),
              {
                deps: { h: { $jig: 1 } }
              },
              f.toString(),
              { deps: { } }
            ]
          }
        ]
      })

      const cg = run.deploy(g)
      test(cg)
      await cg.sync()

      const cg2 = await run.load(cg.location)
      test(cg2)

      run.cache = new LocalCache()
      const cg3 = await run.load(cg.location)
      test(cg3)
    })

    // ------------------------------------------------------------------------

    it('throws if dep is unsupported', () => {
      const run = new Run()
      class A { }
      A.deps = { Date }
      expect(() => run.deploy(A)).to.throw()
      A.deps = { A: () => { } }
      expect(() => run.deploy(A)).to.throw()
      A.deps = { r: new RegExp() }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if deps invalid', () => {
      const run = new Run()
      class A { }
      A.deps = null
      expect(() => run.deploy(A)).to.throw()
      A.deps = '123'
      expect(() => run.deploy(A)).to.throw()
      A.deps = []
      expect(() => run.deploy(A)).to.throw()
      A.deps = new class Deps {}()
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if parent dependency mismatch', () => {
      const run = new Run()
      class A { }
      class C { }
      class B extends A { }
      B.deps = { A: C }
      expect(() => run.deploy(B)).to.throw('Parent dependency mismatch')
    })

    // ------------------------------------------------------------------------

    it('does not throw if different instances of same parent', async () => {
      const run = new Run()
      class A { }
      class B extends A { }
      const A2 = run.deploy(A)
      await A2.sync()
      const A3 = await run.load(A2.location)
      B.deps = { A: A3 }
      expect(() => run.deploy(B)).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if dep is self class name', () => {
      const run = new Run()
      class A { }
      A.deps = { A }
      expect(() => run.deploy(A)).to.throw('Illegal dependency')
    })

    // ------------------------------------------------------------------------

    it('dependencies named Math and Date', () => {
      const run = new Run()
      class Math { }
      class Date { }
      class A { }
      A.deps = { Math, Date }
      run.deploy(A)
    })

    // ------------------------------------------------------------------------

    it('sorts deps deterministically', () => {
      const run = new Run()
      class A { }
      A.deps = { b: 1, a: 2 }
      const CA = run.deploy(A)
      expect(Object.keys(CA.deps)).to.deep.equal(['a', 'b'])
    })

    // ------------------------------------------------------------------------

    it('throws if deps is getter', () => {
      const run = new Run()
      class A { get deps () { return { } } }
      expect(() => run.deploy(A)).to.throw('Getters and setters not supported')
    })
  })

  // --------------------------------------------------------------------------
  // Sandbox
  // --------------------------------------------------------------------------

  describe('Sandbox', () => {
    it('sandboxes methods from globals', async () => {
      const run = new Run()
      class A {
        isUndefined (x) {
          if (typeof window !== 'undefined') return typeof window[x] === 'undefined'
          if (typeof global !== 'undefined') return typeof global[x] === 'undefined'
          return true
        }
      }
      function test (A) {
        const a = new A()
        const bad = ['Date', 'Math', 'eval', 'XMLHttpRequest', 'FileReader', 'WebSocket', 'setTimeout', 'setInterval']
        bad.forEach(x => expect(a.isUndefined(x)).to.equal(true))
      }
      const A1 = run.deploy(A)
      test(A1)
      await run.sync()
      const A2 = await run.load(A.origin)
      test(A2)
      run.cache = new LocalCache()
      const A3 = await run.load(A.origin)
      test(A3)
    })

    // ------------------------------------------------------------------------

    it('sandboxes functions from globals', async () => {
      const run = new Run()
      function f (x) {
        if (typeof window !== 'undefined') return typeof window[x] === 'undefined'
        if (typeof global !== 'undefined') return typeof global[x] === 'undefined'
        return true
      }
      function test (f) {
        const bad = ['Date', 'Math', 'eval', 'XMLHttpRequest', 'FileReader', 'WebSocket', 'setTimeout', 'setInterval']
        bad.forEach(x => expect(f(x)).to.equal(true))
      }
      const f1 = run.deploy(f)
      test(f1)
      await run.sync()
      const f2 = await run.load(f.origin)
      test(f2)
      run.cache = new LocalCache()
      const f3 = await run.load(f.origin)
      test(f3)
    })
  })

  // --------------------------------------------------------------------------
  // Presets
  // --------------------------------------------------------------------------

  describe('presets', () => {
    it('uses blockchain presets', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      const CA = run.deploy(A)
      expect(CA.location).to.equal(A.presets[network].location)
      expect(CA.origin).to.equal(A.presets[network].origin)
      expect(CA.nonce).to.equal(A.presets[network].nonce)
      expect(CA.owner).to.equal(A.presets[network].owner)
      expect(CA.satoshis).to.equal(A.presets[network].satoshis)
      expect(typeof CA.presets).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('clones javascript objects for sandbox', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { a: [], s: new Set() } }
      const CA = run.deploy(A)
      expect(CA.a).not.to.equal(A.presets[network].a)
      expect(CA.s).not.to.equal(A.presets[network].s)
      expect(CA.a instanceof SI.Array).to.equal(true)
      expect(CA.s instanceof SI.Set).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('copies jig presets', async () => {
      const run = new Run()

      class B extends Jig { }
      const b = new B()
      await b.sync()

      const network = run.blockchain.network
      class A extends Jig { }
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0,
          b
        }
      }

      const CA = run.deploy(A)
      expect(CA.b instanceof B).to.equal(true)
      expect(CA.b.location).to.equal(b.location)
    })

    // ------------------------------------------------------------------------

    it('copies berry presets', async () => {
      const run = new Run()

      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await B.load('abc')

      const network = run.blockchain.network
      class A extends Jig { }
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0,
          b
        }
      }
      const CA = run.deploy(A)

      expect(CA.b instanceof Berry).to.equal(true)
      expect(CA.b.location).to.equal(b.location)
    })

    // ------------------------------------------------------------------------

    it('does not add presets object to code jig', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      const CA = run.deploy(A)
      expect(CA.presets).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('returns same code for a copy with same presets', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      class B { }
      Object.assign(B, A)
      const CA = run.deploy(A)
      const CB = run.deploy(B)
      expect(CA).to.equal(CB)
    })

    // ------------------------------------------------------------------------

    it('installs separate presets for parent and child', () => {
      const run = new Run()
      const network = run.blockchain.network
      class B { }
      B.presets = { [network]: { n: 1, m: 0 } }
      class A extends B { }
      A.presets = { [network]: { n: 2 } }
      const CB = run.deploy(B)
      const CA = run.deploy(A)
      expect(CB.n).to.equal(1)
      expect(CB.m).to.equal(0)
      expect(CA.n).to.equal(2)
      expect(CA.m).to.equal(0)
      expect(Object.getOwnPropertyNames(CA).includes('n')).to.equal(true)
      expect(Object.getOwnPropertyNames(CA).includes('m')).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('presets supported for deleted jigs', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = {
        [network]: {
          location: randomLocation().slice(0, -3) + '_d0',
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      const CA = run.deploy(A)
      expect(CA.location).to.equal(A.presets[network].location)
    })

    // ------------------------------------------------------------------------

    it('throws if binding presets are invalid', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = null
      expect(() => run.deploy(A)).to.throw()
      A.presets = { [network]: null }
      expect(() => run.deploy(A)).to.throw()
      A.presets = {
        [network]: {
          location: '_o1',
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      expect(() => run.deploy(A)).to.throw()
      A.presets = {
        [network]: {
          location: '_o1',
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      expect(() => run.deploy(A)).to.throw()
      A.presets = {
        [network]: {
          location: randomLocation(),
          origin: randomLocation(),
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        },
        test: null
      }
      expect(() => run.deploy(A)).to.throw()
      delete A.presets.test
      A.presets[network].nonce = 0
      expect(() => run.deploy(A)).to.throw()
      A.presets[network].nonce = null
      expect(() => run.deploy(A)).to.throw()
      A.presets = []
      expect(() => run.deploy(A)).to.throw()
      A.presets = { [network]: new class Presets {}() }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if binding presets are incomplete', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      const npresets = {
        location: '_o1',
        origin: randomLocation(),
        owner: randomOwner(),
        satoshis: 0
      }
      for (const key of Object.keys(npresets)) {
        A.presets = { [network]: Object.assign({}, npresets) }
        delete A.presets[network][key]
        expect(() => run.deploy(A)).to.throw()
      }
    })

    // ------------------------------------------------------------------------

    it('throws if presets contain unsupported values', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { a: new Date() } }
      expect(() => run.deploy(A)).to.throw()
      A.presets = { [network]: { b: Error } }
      expect(() => run.deploy(A)).to.throw()
      A.presets = { [network]: { c: new (class MySet extends Set { })() } }
      expect(() => run.deploy(A)).to.throw()
      A.presets = { anotherNetwork: { d: Math.random } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('sorts presets deterministically', async () => {
      const run = new Run()

      class A { }
      A.c = 3

      const network = run.blockchain.network
      A.presets = { [network]: { b: 2, a: 1 } }

      expectTx({
        nin: 0,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              A.toString(),
              {
                a: 1,
                b: 2,
                c: 3,
                deps: { }
              }
            ]
          }
        ]
      })

      function test (CA) {
        const expected = ['a', 'b', 'c', 'deps', 'location', 'nonce', 'origin', 'owner', 'satoshis']
        expect(Object.keys(CA)).to.deep.equal(expected)
      }

      const CA = run.deploy(A)
      await CA.sync()

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('must have parent presets', async () => {
      const run = new Run()
      class A { }
      class B extends A { }
      run.deploy(A)
      run.deploy(B)
      await run.sync()

      const presetsB = B.presets
      Run.util.uninstall(A)
      Run.util.uninstall(B)
      B.presets = presetsB

      expect(() => run.deploy(B)).to.throw('A must have presets')
    })

    // ------------------------------------------------------------------------

    it('throws if presets have origin and location are same but nonce is greater than 1', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      const location = randomLocation()
      A.presets = {
        [network]: {
          location: location,
          origin: location,
          nonce: 2,
          owner: randomOwner(),
          satoshis: 0
        }
      }
      expect(() => run.deploy(A)).to.throw('Bad nonce or location')
    })
  })

  // --------------------------------------------------------------------------
  // Errors
  // --------------------------------------------------------------------------

  describe('error', () => {
    it('rolls back if fail to publish', async () => {
      const run = new Run()
      class A { }
      stub(run.purse, 'pay').callsFake(x => x)
      const CA = run.deploy(A)
      await expect(CA.sync()).to.be.rejected
      expect(() => CA.location).to.throw('Deploy failed')
      expect(() => CA.origin).to.throw('Deploy failed')
      expect(() => CA.nonce).to.throw('Deploy failed')
      expect(() => CA.owner).to.throw('Deploy failed')
      expect(() => CA.satoshis).to.throw('Deploy failed')
    })

    // ------------------------------------------------------------------------

    it('does not set metadata on local type', async () => {
      const run = new Run()
      stub(run.purse, 'pay').callsFake(x => x)
      class A { }
      run.deploy(A)
      await expect(run.sync()).to.be.rejected
      expect(A.origin).to.equal(undefined)
      expect(A.location).to.equal(undefined)
      expect(A.nonce).to.equal(undefined)
      expect(A.owner).to.equal(undefined)
      expect(A.satoshis).to.equal(undefined)
      expect(A.presets).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if non-function', () => {
      const run = new Run()
      const error = 'Only functions and classes are supported'
      expect(() => run.deploy()).to.throw(error)
      expect(() => run.deploy(1)).to.throw(error)
      expect(() => run.deploy(true)).to.throw(error)
      expect(() => run.deploy(null)).to.throw(error)
      expect(() => run.deploy('function')).to.throw(error)
      expect(() => run.deploy('class A {}')).to.throw(error)
      expect(() => run.deploy({})).to.throw(error)
      expect(() => run.deploy([])).to.throw(error)
      expect(() => run.deploy(Symbol.hasInstance)).to.throw(error)
      expect(() => run.deploy((class A { }).prototype)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if built-in', () => {
      const run = new Run()
      const error = 'Cannot install intrinsic'
      expect(() => run.deploy(Object)).to.throw(error)
      expect(() => run.deploy(Date)).to.throw(error)
      expect(() => run.deploy(Uint8Array)).to.throw(error)
      expect(() => run.deploy(Math.sin)).to.throw(error)
      expect(() => run.deploy(parseInt)).to.throw(error)
      expect(() => run.deploy(SI.Object)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if anonymous', () => {
      const run = new Run()
      const error = 'Anonymous types not supported'
      expect(() => run.deploy(() => {})).to.throw(error)
      expect(() => run.deploy(class {})).to.throw(error)
      const g = function () { }
      expect(() => run.deploy(g)).to.throw(error)
      const A = class { }
      expect(() => run.deploy(A)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if prototypal inheritance', () => {
      const run = new Run()
      function A () { }
      function B () { }
      B.prototype = Object.create(A.prototype)
      const error = 'Prototypal inheritance not supported'
      expect(() => run.deploy(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if contains bindings', () => {
      const run = new Run()
      class A { }
      A.location = randomLocation()
      A.origin = randomLocation()
      A.owner = randomOwner()
      A.satoshis = 0
      A.nonce = 1
      const error = 'Must not have any bindings'
      expect(() => run.deploy(A)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if error creating parent dependency', () => {
      const run = new Run()
      class A { }
      class B extends A { }
      B.Date = Date
      expect(() => run.deploy(B)).to.throw('Cannot install intrinsic')
    })

    // ------------------------------------------------------------------------

    it('throws if symbol methods', () => {
      const run = new Run()
      class A { static [Symbol.iterator] () { } }
      class B { [Symbol.iterator] () { } }
      const error = 'Symbol methods not supported'
      expect(() => run.deploy(A)).to.throw(error)
      expect(() => run.deploy(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if accessors', () => {
      const run = new Run()
      class A { static get x () { } }
      class B { static set x (value) { } } // eslint-disable-line
      class C { get x () { } }
      class D { set x (value) { } } // eslint-disable-line
      const error = 'Getters and setters not supported'
      expect(() => run.deploy(A)).to.throw(error)
      expect(() => run.deploy(B)).to.throw(error)
      expect(() => run.deploy(C)).to.throw(error)
      expect(() => run.deploy(D)).to.throw(error)
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('throws if constructor exists', () => {
      const run = new Run()
      class A extends Jig { constructor () { super(); this.n = 1 } }
      const error = 'Jig must use init() instead of constructor()'
      expect(() => run.deploy(A)).to.throw(error)
      expect(() => new A()).to.throw(error)
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('throws if constructor exists', async () => {
      const run = new Run()
      class B extends Berry { constructor () { super(); this.n = 1 } }
      const error = 'Berry must use init() instead of constructor()'
      expect(() => run.deploy(B)).to.throw(error)
      await expect(B.load('abc')).to.be.rejectedWith(error)
    })
  })
})

// ------------------------------------------------------------------------------------------------
