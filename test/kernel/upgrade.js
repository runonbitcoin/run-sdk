/**
 * upgrade.js
 *
 * Tests for upgrading code
 */

const { describe, it, afterEach } = require('mocha')
const { stub } = require('sinon')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry, Code } = Run
const { LocalCache } = Run.plugins
const { expectTx } = require('../env/misc')
const unmangle = require('../env/unmangle')
const SI = unmangle(unmangle(Run)._Sandbox)._intrinsics

// ------------------------------------------------------------------------------------------------
// Upgrade
// ------------------------------------------------------------------------------------------------

describe('Upgrade', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Upgrade
  // --------------------------------------------------------------------------

  describe('upgrade', () => {
    it('upgrades class', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      class B { }

      function test (CA) {
        expect(CA.toString()).to.equal(B.toString())
        expect(CA.name).to.equal('B')
        expect(CA.location).not.to.equal(CA.origin)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class B { }',
              { deps: { } }
            ]
          }
        ]
      })

      expect(CA.upgrade(B)).to.equal(CA)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('changes methods', async () => {
      const run = new Run()

      class A {
        a1 () { }
        static a2 () { }
      }
      const CA = run.deploy(A)
      await CA.sync()

      class B {
        b1 () { }
        static b2 () { }
      }

      function test (CA) {
        expect(typeof CA.prototype.a1).to.equal('undefined')
        expect(typeof CA.prototype.b1).to.equal('function')
        expect(typeof CA.a2).to.equal('undefined')
        expect(typeof CA.b2).to.equal('function')
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              B.toString(),
              { deps: { } }
            ]
          }
        ]
      })

      expect(CA.upgrade(B)).to.equal(CA)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('changes props', async () => {
      const run = new Run()

      class A { }
      A.x = 1
      const CA = run.deploy(A)
      await CA.sync()

      class B { }
      B.y = 2

      function test (CA) {
        expect(typeof CA.x).to.equal('undefined')
        expect(CA.y).to.equal(2)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class B { }',
              { deps: { }, y: 2 }
            ]
          }
        ]
      })

      expect(CA.upgrade(B)).to.equal(CA)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('changes deps', async () => {
      const run = new Run()

      function f () { return [typeof a, typeof b, 'f'] }
      f.deps = { a: 1 }
      const cf = run.deploy(f)
      await cf.sync()

      function g () { return [typeof a, typeof b, 'g'] }
      g.deps = { b: 2 }

      function test (cf) {
        expect(cf()[0]).to.equal('undefined')
        expect(cf()[1]).to.equal('number')
        expect(cf()[2]).to.equal('g')
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              g.toString(),
              { deps: { b: 2 } }
            ]
          }
        ]
      })

      expect(cf.upgrade(g)).to.equal(cf)
      await cf.sync()
      test(cf)

      const cf2 = await run.load(cf.location)
      test(cf2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      test(cf3)
    })

    // ------------------------------------------------------------------------

    it('change props before upgrade', async () => {
      const run = new Run()

      class O extends Jig { }
      O.o = { }
      const CA = run.deploy(O)

      class A extends Jig { static f () { this.n = 1; this.o.m = 2 } }
      A.o = { }

      CA.upgrade(A)
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

    // ------------------------------------------------------------------------

    it('upgrades multiple in a batch', async () => {
      const run = new Run()

      function f () { }
      class A { }
      class B extends Jig { }

      const cf = run.deploy(f)
      const CA = run.deploy(A)
      const CB = run.deploy(B)

      await run.sync()

      function f2 () { }
      class A2 { }
      class B2 extends Jig { }

      run.transaction(() => {
        cf.upgrade(f2)
        CA.upgrade(A2)
        CB.upgrade(B2)
      })

      await run.sync()

      function test (cf, CA, CB) {
        expect(cf.name).to.equal('f2')
        expect(CA.name).to.equal('A2')
        expect(CB.name).to.equal('B2')
        expect(cf.nonce).to.equal(2)
        expect(CA.nonce).to.equal(2)
        expect(CB.nonce).to.equal(2)
      }

      test(cf, CA, CB)

      const cf2 = await run.load(cf.location)
      const CA2 = await run.load(CA.location)
      const CB2 = await run.load(CB.location)
      test(cf2, CA2, CB2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      const CA3 = await run.load(CA.location)
      const CB3 = await run.load(CB.location)
      test(cf3, CA3, CB3)
    })

    // ------------------------------------------------------------------------

    it('upgrade and destroy in same transaction', async () => {
      const run = new Run()
      class A { }
      class B { }
      const C = run.deploy(A)
      await C.sync()

      expectTx({
        nin: 1,
        nref: 0,
        nout: 0,
        ndel: 1,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              B.toString(),
              { deps: { } }
            ]
          },
          {
            op: 'CALL',
            data: [
              { $jig: 0 },
              'destroy',
              []
            ]
          }
        ]
      })

      run.transaction(() => {
        C.upgrade(B)
        C.destroy()
      })

      function test (C) {
        expect(C.name).to.equal('B')
        expect(C.location.endsWith('_d0')).to.equal(true)
        expect(C.nonce).to.equal(2)
      }

      await C.sync()
      test(C)

      const C2 = await run.load(C.location)
      test(C2)

      run.cache = new LocalCache()
      const C3 = await run.load(C.location)
      test(C3)
    })
  })

  // --------------------------------------------------------------------------
  // Extensions
  // --------------------------------------------------------------------------

  describe('extensions', () => {
    it('change child class', async () => {
      const run = new Run()

      class P extends Jig { }
      P.sealed = false
      const CP = run.deploy(P)
      await CP.sync()

      class C extends CP { }
      const CC = run.deploy(C)
      await CC.sync()

      function test (CC) {
        expect(CC.toString()).to.equal('class C2 extends P { }')
        expect(Object.getPrototypeOf(CC).name).to.equal('P')
      }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class C2 extends P { }',
              { deps: { P: { $jig: 1 } } }
            ]
          }
        ]
      })

      class C2 extends CP { }
      CC.upgrade(C2)
      await CC.sync()
      test(CC)

      const CC2 = await run.load(CC.location)
      test(CC2)

      run.cache = new LocalCache()
      const CC3 = await run.load(CC.location)
      test(CC3)
    })

    // ------------------------------------------------------------------------

    it('deploys new parent chain', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      function test (CO) {
        expect(CO.name).to.equal('B')
        expect(Object.getPrototypeOf(CO).name).to.equal('A')
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class A { }',
              { deps: { } }
            ]
          },
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class B extends A { }',
              { deps: { A: { $jig: 1 } } }
            ]
          }
        ]
      })

      class A { }
      class B extends A { }
      CO.upgrade(B)
      await CO.sync()
      test(CO)

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('remove parent', async () => {
      const run = new Run()

      class A { }
      class B extends A { }
      const CB = run.deploy(B)
      await CB.sync()

      function test (CO) {
        expect(Object.getPrototypeOf(CO)).to.equal(SI.Function.prototype)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class C { }',
              { deps: { } }
            ]
          }
        ]
      })

      class C { }
      CB.upgrade(C)
      await CB.sync()
      test(CB)

      const CB2 = await run.load(CB.location)
      test(CB2)

      run.cache = new LocalCache()
      const CB3 = await run.load(CB.location)
      test(CB3)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid parent', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.badProp = new Date()
      class C extends B { }
      expect(() => CA.upgrade(C)).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // Props
  // --------------------------------------------------------------------------

  describe('props', () => {
    it('complex props', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      function test (CO) {
        expect(typeof CO.o).to.equal('object')
        expect(CO.n).to.equal(1)
        expect(CO.b).to.equal(false)
        expect(CO.s).to.equal('abc')
        expect(CO.o.o).to.equal(CO.o)
        expect(CO.set instanceof SI.Set).to.equal(true)
        expect(CO.set.size).to.equal(1)
        expect(CO.set.values().next().value).to.equal(CO)
        expect(CO.set.A).to.equal(CO)
        expect(CO.arr instanceof SI.Array).to.equal(true)
        expect(CO.arr.length).to.equal(1)
        expect(CO.arr[0]).to.equal(CO.arr)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class A { }',
              {
                arr: [{ $dup: ['2', 'arr'] }],
                b: false,
                deps: { },
                n: 1,
                o: { o: { $dup: ['2', 'o'] } },
                s: 'abc',
                set: { $set: [{ $dup: ['0'] }], props: { A: { $dup: ['0'] } } }
              }
            ]
          }
        ]
      })

      class A { }
      A.n = 1
      A.b = false
      A.s = 'abc'
      A.o = {}
      A.o.o = A.o
      A.set = new Set()
      A.set.add(A)
      A.set.A = A
      A.arr = []
      A.arr.push(A.arr)

      CO.upgrade(A)
      await CO.sync()
      test(CO)

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('deploys new code', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      function test (CO) {
        expect(CO.B instanceof Code).to.equal(true)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class B { }',
              { deps: { } }
            ]
          },
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class A { }',
              {
                B: { $jig: 1 },
                deps: { }
              }
            ]
          }
        ]
      })

      class A { }
      class B { }
      A.B = B
      CO.upgrade(A)
      test(CO)
      await CO.sync()

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('upgrade to self-reference', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.A = CA
      CA.upgrade(B)
      expect(CA.A).to.equal(CA)
      await CA.sync()
      await run.load(CA.location)
      run.cache = new LocalCache()
      await run.load(CA.location)
    })

    // ------------------------------------------------------------------------

    it('code reference', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      class B { }

      function test (CO) {
        expect(CO.A.origin).to.equal(CA.origin)
      }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              B.toString(),
              {
                A: { $jig: 1 },
                deps: { }
              }
            ]
          }
        ]
      })

      B.A = A
      CO.upgrade(B)
      test(CO)
      await CO.sync()

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('jig reference', async () => {
      const run = new Run()

      class A { }
      const CA = run.deploy(A)
      await CA.sync()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      class C extends Jig { }
      const c = new C()
      await c.sync()

      class B { }

      function test (CO) {
        expect(CO.c instanceof Jig).to.equal(true)
      }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              B.toString(),
              {
                c: { $jig: 1 },
                deps: { }
              }
            ]
          }
        ]
      })

      B.c = c
      CO.upgrade(B)
      test(CO)
      await CO.sync()

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('berry reference', async () => {
      const run = new Run()

      class A extends Jig { }
      const CA = run.deploy(A)
      await CA.sync()

      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await B.load('abc')

      class A2 extends Jig { }
      A2.b = b

      expectTx({
        nin: 1,
        nref: 2,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              A2.toString(),
              {
                b: { $jig: 1 },
                deps: { Jig: { $jig: 2 } }
              }
            ]
          }
        ]
      })

      function test (CA) {
        expect(CA.b instanceof Berry).to.equal(true)
        expect(CA.b.location).to.equal(b.location)
      }

      CA.upgrade(A2)
      await CA.sync()
      test(CA)

      const CA2 = await run.load(CA.location)
      test(CA2)

      run.cache = new LocalCache()
      const CA3 = await run.load(CA.location)
      test(CA3)
    })

    // ------------------------------------------------------------------------

    it('throws if symbol', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.symbol = Symbol.hasInstance
      expect(() => CA.upgrade(B)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if intrinsic', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.intrinsic = Map
      const error = 'Cannot install intrinsic'
      expect(() => CA.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if anonymous', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.anon = () => {}
      const error = 'Anonymous types not supported'
      expect(() => CA.upgrade(B)).to.throw(error)
    })
  })

  // --------------------------------------------------------------------------
  // Deps
  // --------------------------------------------------------------------------

  describe('deps', () => {
    it('complex deps', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      function test (CO) {
        expect(typeof CO.deps.o).to.equal('object')
        expect(CO.deps.n).to.equal(1)
        expect(CO.deps.b).to.equal(false)
        expect(CO.deps.s).to.equal('abc')
        expect(CO.deps.o.o).to.equal(CO.deps.o)
        expect(CO.deps.set instanceof SI.Set).to.equal(true)
        expect(CO.deps.set.size).to.equal(1)
        expect(CO.deps.set.values().next().value).to.equal(CO)
        expect(CO.deps.set.A).to.equal(CO)
        expect(CO.deps.arr instanceof SI.Array).to.equal(true)
        expect(CO.deps.arr.length).to.equal(1)
        expect(CO.deps.arr[0]).to.equal(CO.deps.arr)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class A { }',
              {
                deps: {
                  n: 1,
                  b: false,
                  s: 'abc',
                  o: { o: { $dup: ['2', 'deps', 'o'] } },
                  set: { $set: [{ $dup: ['0'] }], props: { A: { $dup: ['0'] } } },
                  arr: [{ $dup: ['2', 'deps', 'arr'] }]
                }
              }
            ]
          }
        ]
      })

      class A { }
      A.deps = {}
      A.deps.n = 1
      A.deps.b = false
      A.deps.s = 'abc'
      A.deps.o = {}
      A.deps.o.o = A.deps.o
      A.deps.set = new Set()
      A.deps.set.add(A)
      A.deps.set.A = A
      A.deps.arr = []
      A.deps.arr.push(A.deps.arr)

      CO.upgrade(A)
      await CO.sync()
      test(CO)

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('deploys new code', async () => {
      const run = new Run()

      class O { }
      const CO = run.deploy(O)
      await CO.sync()

      function test (CO) {
        expect(CO.deps.B instanceof Code).to.equal(true)
      }

      expectTx({
        nin: 1,
        nref: 0,
        nout: 2,
        ndel: 0,
        ncre: 1,
        exec: [
          {
            op: 'DEPLOY',
            data: [
              'class B { }',
              { deps: { } }
            ]
          },
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              'class A { }',
              {
                deps: { B: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      class A { }
      class B { }
      A.deps = { B }
      CO.upgrade(A)
      test(CO)
      await CO.sync()

      const CO2 = await run.load(CO.location)
      test(CO2)

      run.cache = new LocalCache()
      const CO3 = await run.load(CO.location)
      test(CO3)
    })

    // ------------------------------------------------------------------------

    it('code reference', async () => {
      const run = new Run()

      function f () { }
      const cf = run.deploy(f)
      await cf.sync()

      function o () { }
      const co = run.deploy(o)
      await co.sync()

      function test (co) {
        expect(co.deps.f.origin).to.equal(f.origin)
        expect(co()).to.equal(co.deps.f)
      }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              g.toString(),
              {
                deps: { f: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      function g () { return f }
      g.deps = { f }

      co.upgrade(g)
      test(co)
      await co.sync()

      const co2 = await run.load(co.location)
      test(co2)

      run.cache = new LocalCache()
      const co3 = await run.load(co.location)
      test(co3)
    })

    // ------------------------------------------------------------------------

    it('jig reference', async () => {
      const run = new Run()

      function f () { }
      const cf = run.deploy(f)
      await cf.sync()

      class A extends Jig { }
      const a = new A()
      await a.sync()

      function o () { }
      const co = run.deploy(o)
      await co.sync()

      function test (co) {
        expect(co.deps.a.origin).to.equal(a.origin)
        expect(co.deps.a.location).to.equal(a.location)
        expect(co().location).to.equal(a.location)
      }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              g.toString(),
              {
                deps: { a: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      function g () { return a }
      g.deps = { a }

      co.upgrade(g)
      test(co)
      await co.sync()

      const co2 = await run.load(co.location)
      test(co2)

      run.cache = new LocalCache()
      const co3 = await run.load(co.location)
      test(co3)
    })

    // ------------------------------------------------------------------------

    it('berry reference', async () => {
      const run = new Run()

      function f () { return b.n } // eslint-disable-line
      const cf = run.deploy(f)
      await cf.sync()
      expect(() => cf()).to.throw()

      class B extends Berry { init () { this.n = 1 } }
      const CB = run.deploy(B)
      await CB.sync()
      const b = await B.load('abc')

      function test (cf) {
        expect(cf()).to.equal(1)
        expect(cf.deps.b instanceof Berry).to.equal(true)
      }

      function g () { return b.n }
      g.deps = { b }

      expectTx({
        nin: 1,
        nref: 1,
        nout: 1,
        ndel: 0,
        ncre: 0,
        exec: [
          {
            op: 'UPGRADE',
            data: [
              { $jig: 0 },
              g.toString(),
              {
                deps: { b: { $jig: 1 } }
              }
            ]
          }
        ]
      })

      cf.upgrade(g)
      test(cf)
      await cf.sync()

      const cf2 = await run.load(cf.location)
      test(cf2)

      run.cache = new LocalCache()
      const cf3 = await run.load(cf.location)
      test(cf3)
    })

    // ------------------------------------------------------------------------

    it('throws if symbol', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.deps = { symbol: Symbol.iterator }
      expect(() => CA.upgrade(B)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if intrinsic', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.deps = { Math }
      const error = 'Cannot clone intrinsic'
      expect(() => CA.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if anonymous', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      B.deps = { f: () => { } }
      const error = 'Anonymous types not supported'
      expect(() => CA.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if dep is self function name', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      function g () { }
      g.deps = { g }
      expect(() => cf.upgrade(g)).to.throw('Illegal dependency')
    })

    // ------------------------------------------------------------------------

    it('throws if deps is getter', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { get deps () { return { } } }
      expect(() => CA.upgrade(B)).to.throw('Getters and setters not supported')
    })
  })

  // --------------------------------------------------------------------------
  // Errors
  // --------------------------------------------------------------------------

  describe('errors', () => {
    it('rolls back', async () => {
      const run = new Run()
      class A { static f () { } }
      A.x = 1
      const CA = run.deploy(A)
      await CA.sync()

      class B { static g () { } }
      B.y = 2
      stub(run.purse, 'pay').callsFake(x => x)
      CA.upgrade(B)

      expect(CA.toString()).to.equal(B.toString())
      expect(typeof CA.x).to.equal('undefined')
      expect(CA.y).to.equal(2)
      expect(typeof CA.f).to.equal('undefined')
      expect(typeof CA.g).to.equal('function')

      await expect(CA.sync()).to.be.rejected

      expect(CA.toString()).to.equal(A.toString())
      expect(CA.x).to.equal(1)
      expect(typeof CA.y).to.equal('undefined')
      expect(typeof CA.f).to.equal('function')
      expect(typeof CA.g).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('rolls back in batch', async () => {
      const run = new Run()

      class A { }
      class B extends Berry { }
      class C extends Jig { }
      C.n = 1
      function f () { }

      const [CA, CB, CC, cf] = run.transaction(() => {
        const CA = run.deploy(A)
        const CB = run.deploy(B)
        const CC = run.deploy(C)
        const cf = run.deploy(f)
        return [CA, CB, CC, cf]
      })
      await run.sync()

      const b = await B.load('abc')
      class A2 { }
      A2.b = b
      class C2 extends Jig { }
      function f2 () { }

      run.transaction(() => {
        CA.upgrade(A2)
        CB.destroy()
        CC.upgrade(C2)
        cf.upgrade(f2)
      })
      stub(run.purse, 'pay').callsFake(x => x)
      await expect(CA.sync()).to.be.rejected

      expect(CA.name).to.equal('A')
      expect(CC.name).to.equal('C')
      expect(cf.name).to.equal('f')
      expect(CA.nonce).to.equal(1)
      expect(CB.nonce).to.equal(1)
      expect(CC.nonce).to.equal(1)
      expect(cf.nonce).to.equal(1)
      expect(typeof CA.b).to.equal('undefined')
      expect(CC.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade non-code', () => {
      const error = 'upgrade unavailable'
      expect(() => Code.prototype.upgrade.call({}, class A { })).to.throw(error)
      expect(() => Code.prototype.upgrade.call(class A { }, class A { })).to.throw(error)
      expect(() => Code.prototype.upgrade.call(null, class A { })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade class to function', () => {
      const run = new Run()
      class A { }
      function f () { }
      const CA = run.deploy(A)
      expect(() => CA.upgrade(f)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade function to class', () => {
      const run = new Run()
      function f () { }
      class A { }
      const cf = run.deploy(f)
      expect(() => cf.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade jig class to sidekick code', () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      const error = 'Cannot change jigs to sidekicks, or vice versa'
      expect(() => CA.upgrade(class B { })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade sidekick code to jig class', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      const error = 'Cannot change jigs to sidekicks, or vice versa'
      expect(() => CA.upgrade(class B extends Jig { })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade a destroyed jig', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CA.destroy()
      class B { }
      expect(() => CA.upgrade(B)).to.throw('Cannot upgrade destroyed jig')
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade to a code jig', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      class B { }
      const CB = run.deploy(B)
      const error = 'Cannot upgrade to a code jig'
      expect(() => CB.upgrade(CA)).to.throw(error)
      await CA.sync()
      expect(() => CB.upgrade(CA)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if prototypal inheritance', async () => {
      const run = new Run()
      function O () { }
      const CO = run.deploy(O)
      function A () { }
      function B () { }
      B.prototype = Object.create(A.prototype)
      const error = 'Prototypal inheritance not supported'
      expect(() => CO.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if symbol methods', () => {
      const run = new Run()
      function O () { }
      const CO = run.deploy(O)
      class A { static [Symbol.iterator] () { } }
      class B { [Symbol.iterator] () { } }
      const error = 'Symbol methods not supported'
      expect(() => CO.upgrade(A)).to.throw(error)
      expect(() => CO.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if accessors', () => {
      const run = new Run()
      function O () { }
      const CO = run.deploy(O)
      class A { static get x () { } }
      class B { static set x (value) { } } // eslint-disable-line
      class C { get x () { } }
      class D { set x (value) { } } // eslint-disable-line
      const error = 'Getters and setters not supported'
      expect(() => CO.upgrade(A)).to.throw(error)
      expect(() => CO.upgrade(B)).to.throw(error)
      expect(() => CO.upgrade(C)).to.throw(error)
      expect(() => CO.upgrade(D)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade in a method', () => {
      const run = new Run()
      class A extends Jig { static f () { this.upgrade(class B { }) } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('upgrade unavailable')
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade with undeployed berry', async () => {
      const run = new Run()
      class B extends Berry { }
      const b = await B.load('abc')
      class A { }
      class A2 { }
      A2.b = b
      const CA = run.deploy(A)
      CA.upgrade(A2)
      await expect(run.sync()).to.be.rejectedWith('Bad location')
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('upgrades instances on sync', async () => {
      const run = new Run()
      class A extends Jig { f () { return 1 } }
      class B extends Jig { f () { return 2 } }
      const CA = run.deploy(A)
      await CA.sync()
      const a = new CA()
      expect(a.f()).to.equal(1)
      CA.upgrade(B)
      await CA.sync()
      expect(a.f()).to.equal(2)
      await a.sync()
      const a2 = await run.load(a.origin)
      expect(a2.f()).to.equal(1)
      await a2.sync()
      expect(a2.f()).to.equal(2)
      run.cache = new LocalCache()
      const a3 = await run.load(a.origin)
      expect(a3.f()).to.equal(1)
      await a3.sync()
      expect(a3.f()).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('can create old instances', async () => {
      const run = new Run()
      class A extends Jig { f () { return 1 } }
      class B extends Jig { f () { return 2 } }
      const C = run.deploy(A)
      C.upgrade(B)
      await C.sync()
      const CO = await run.load(C.origin)
      const a = new CO()
      const b = new C()
      expect(a.constructor.location).not.to.equal(b.constructor.location)
      await a.sync({ inner: true })
      expect(a.constructor.location).to.equal(b.constructor.location)
    })

    // ------------------------------------------------------------------------

    it('can delay upgrade instances', async () => {
      const run = new Run()
      class A extends Jig { f (n) { this.n = n } }
      class B extends Jig { f () { this.n = 'error' } }
      const C = run.deploy(A)
      C.upgrade(B)
      await C.sync()
      const CO = await run.load(C.origin)
      const a = new CO()
      a.f(1)
      expect(a.n).to.equal(1)
      a.f(2)
      expect(a.n).to.equal(2)
      await a.sync({ inner: true })
      a.f(3)
      expect(a.n).to.equal('error')
    })
  })

  // --------------------------------------------------------------------------
  // Berry
  // --------------------------------------------------------------------------

  describe('Berry', () => {
    it('cannot upgrade from berry class', async () => {
      const run = new Run()
      class B extends Berry { }
      class C extends Berry { }
      const CB = run.deploy(B)
      const error = 'Cannot upgrade from berry class: B'
      expect(() => CB.upgrade(C)).to.throw(error)
      await CB.sync()
      expect(() => CB.upgrade(C)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade sidekick class to berry class', async () => {
      const run = new Run()
      class A { }
      class B extends Berry { }
      const CA = run.deploy(A)
      const error = 'Cannot upgrade to berry class: B'
      expect(() => CA.upgrade(B)).to.throw(error)
      await CA.sync()
      expect(() => CA.upgrade(B)).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('cannot upgrade jig class to berry class', async () => {
      const run = new Run()
      class A extends Jig { }
      class B extends Berry { }
      const CA = run.deploy(A)
      const error = 'Cannot change jigs to sidekicks, or vice versa'
      expect(() => CA.upgrade(B)).to.throw(error)
      await CA.sync()
      expect(() => CA.upgrade(B)).to.throw(error)
    })
  })
})

// ------------------------------------------------------------------------------------------------
