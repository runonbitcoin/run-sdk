/**
 * publish.js
 *
 * Tests for Publish functionality
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const { expectTx } = require('../env/misc')
const Run = require('../env/run')
const { Jig } = Run
const { Mockchain, LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Publish
// ------------------------------------------------------------------------------------------------

describe('Publish', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------

  it('throws if different network', async () => {
    const run = new Run()
    class A extends Jig { f () { this.n = 1 } }
    const a = new A()
    await run.sync()
    const run2 = new Run({ blockchain: new Mockchain() })
    a.f()
    await expect(run2.sync()).to.be.rejected
  })

  // --------------------------------------------------------------------------

  it('throws if already spent', async () => {
    const run = new Run()
    class Store extends Jig { set (x) { this.x = x } }
    const a = new Store()
    a.set(1)
    await a.sync()
    const a2 = await run.load(a.origin)
    a2.set(2)
    await expect(a2.sync()).to.be.rejectedWith('[jig Store] was spent in another transaction')
  })

  // --------------------------------------------------------------------------

  it('throws if owner signature is missing', async () => {
    const run = new Run()
    class A extends Jig {
      init () { this.n = 1 }

      f () { this.n = 2 }
    }
    const a = new A()
    await a.sync()
    stub(run.owner, 'sign').callsFake(x => x)
    a.f()
    await expect(a.sync()).to.be.rejected
  })

  // ------------------------------------------------------------------------

  it('assign without reference', async () => {
    const run = new Run()

    class X { }
    class B { }
    B.X = X

    class A extends Jig {
      init (B) {
        this.X = B.X
      }
    }

    const B2 = run.deploy(B)
    const A2 = run.deploy(A)
    await run.sync()

    expectTx({
      nin: 0,
      nref: 2,
      nout: 1,
      ndel: 0,
      ncre: 1,
      exec: [
        {
          op: 'NEW',
          data: [{ $jig: 0 }, [{ $jig: 1 }]]
        }
      ]
    })

    function test (a) {
      expect(a.X.location).to.equal(X.location)
    }

    const a = new A2(B2)
    await a.sync()
    test(a)

    const a2 = await run.load(a.location)
    test(a2)

    run.cache = new LocalCache()
    const a3 = await run.load(a.location)
    test(a3)
  })

  // ------------------------------------------------------------------------

  it('unifies unreferenced jigs', async () => {
    const run = new Run()

    class A extends Jig { }
    const A2 = run.deploy(A)
    A2.auth()
    await A2.sync()
    const A1 = await run.load(A.origin)

    class B { }
    B.A = A1
    const B2 = run.deploy(B)

    class C { }
    C.A = A2
    const C2 = run.deploy(C)

    class D extends Jig { static assign (B, C) { this.A = B.A }}
    const D2 = run.deploy(D)
    await D2.sync()

    function test (D) {
      expect(D.A.location).to.equal(A2.location)
    }

    D2.assign(B2, C2)
    await run.sync()
    test(D2)

    const D3 = await run.load(D2.location)
    test(D3)

    run.cache = new LocalCache()
    const D4 = await run.load(D2.location)
    test(D4)
  })

  // --------------------------------------------------------------------------

  it('parent satoshis correct after changing fees', async () => {
    const bsv = require('bsv')
    bsv.Transaction.FEE_PER_KB = 1000
    new Run() // eslint-disable-line
    class A extends Jig { f () { this.n = 1 } }
    const a = new A()
    await a.sync()
    bsv.Transaction.FEE_PER_KB = 500
    a.f()
    await a.sync()
  })
})

// ------------------------------------------------------------------------------------------------
