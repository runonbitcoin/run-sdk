/**
 * sync.js
 *
 * Tests for sync functionality
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const { Transaction } = require('bsv')
const Run = require('../env/run')
const { Jig } = Run
const { LocalCache } = Run.plugins
const { payFor, populatePreviousOutputs } = require('../env/misc')

// ------------------------------------------------------------------------------------------------
// Sync
// ------------------------------------------------------------------------------------------------

describe('Sync', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Sync
  // --------------------------------------------------------------------------

  describe('Sync', () => {
    it('sync with already updated inner jig', async () => {
      const run = new Run()
      class A {}
      class B {}
      B.A = A
      A.B = B
      const tx = new Run.Transaction()
      const CA = tx.update(() => run.deploy(A))
      const CB = tx.update(() => run.deploy(B))
      await tx.publish()
      CA.auth()
      CB.auth()
      await CA.sync()
      await CB.sync()
      const CB2 = await run.load(CB.location)
      await CB2.A.sync()
      await CB2.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if attempt to update an old state', async () => {
      const run = new Run()
      class A extends Jig { set (x) { this.x = x } }
      const a = new A()
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      a2.set(1)
      await a2.sync()
      a.set(2)
      await expect(a.sync()).to.be.rejectedWith('txn-mempool-conflict')
      expect(a.x).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('throws if spend tx does not exist', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      run.blockchain.spends = () => '0000000000000000000000000000000000000000000000000000000000000000'
      try {
        await expect(a.sync()).to.be.rejectedWith('No such mempool or blockchain transaction')
      } finally {
        run.deactivate()
      }
    })

    // ------------------------------------------------------------------------

    it('throws if spend is incorrect', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      const b = new A()
      await run.sync()
      run.blockchain.spends = () => b.location.slice(0, 64)
      try {
        await expect(a.sync()).to.be.rejectedWith('[jig A] not found in the transaction')
      } finally {
        run.deactivate()
      }
    })

    // ------------------------------------------------------------------------

    it('disable forward sync', async () => {
      const run = new Run()
      class A extends Jig { set (x) { this.x = x } }
      const a = new A()
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      a2.set(1)
      await a2.sync()
      expect(a.x).to.equal(undefined)
      await a.sync({ forward: false })
      expect(a.x).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if forward sync is unsupported', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync() // pending transactions must publish first
      run.blockchain.spends = async () => { throw new Error('spends') }
      try {
        await expect(a.sync()).to.be.rejected
      } finally {
        run.deactivate()
      }
    })

    // ------------------------------------------------------------------------

    it('forward sync inner jigs', async () => {
      const run = new Run()
      class Store extends Jig { set (x, y) { this[x] = y } }
      const a = new Store()
      const b = new Store()
      a.set('b', b)
      await run.sync()
      run.cache = new LocalCache()
      const b2 = await run.load(b.location)
      b2.set('n', 1)
      await b2.sync()
      expect(a.b.n).to.equal(undefined)
      await a.sync()
      expect(a.b.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('forward sync circularly referenced jigs', async () => {
      const run = new Run()
      class A extends Jig { setB (b) { this.b = b } }
      class B extends Jig { setA (a) { this.a = a } }
      const a = new A()
      const b = new B()
      a.setB(b)
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      b2.setA(a2)
      await b2.sync()
      expect(a.b.a).to.equal(undefined)
      await a.sync()
      expect(a.b.a.location).to.equal(a.location)
    })

    // ------------------------------------------------------------------------

    it('forward sync', async () => {
      const run = new Run()
      class A extends Jig { set (x) { this.x = x } }
      const a = new A()
      await a.sync()

      run.cache = new LocalCache()
      const a2 = await run.load(a.location)

      a2.set(1)
      a2.set(2)
      await a2.sync()

      expect(a.x).to.equal(undefined)
      await a.sync()
      expect(a.x).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('sync destroyed jig', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CA.destroy()
      await CA.sync()
      const location = CA.location
      await CA.sync()
      expect(CA.location).to.equal(location)
    })

    // ------------------------------------------------------------------------

    it('sync destroyed inner jig', async () => {
      const run = new Run()
      class A { }
      class B { }
      B.A = A
      const CB = run.deploy(B)
      CB.A.destroy()
      await run.sync()
      const location = CB.location
      await CB.sync()
      expect(CB.location).to.equal(location)
    })

    // ------------------------------------------------------------------------

    it('disable inner sync', async () => {
      const run = new Run()
      class A extends Jig { set (n) { this.n = n } }
      const a = new A()
      const b = new A()
      a.set(b)
      await a.sync()
      const a2 = await run.load(a.location)
      b.set(1)
      await b.sync()
      expect(a2.n.n).to.equal(undefined)
      await a2.sync({ inner: false })
      expect(a2.n.n).to.equal(undefined)
      await a2.sync()
      expect(a2.n.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('improper spend does not destroy', async () => {
      const run = new Run()
      class A extends Jig { }
      const CA = run.deploy(A)
      await CA.sync()
      const utxos = await run.blockchain.utxos(run.owner.address)
      const tx = new Transaction().from(utxos).to(run.purse.address, Transaction.DUST_AMOUNT)
      const paid = new Transaction(await payFor(tx, run))
      await populatePreviousOutputs(paid, run.blockchain)
      paid.sign(run.owner.privkey)
      await run.blockchain.broadcast(paid.toString('hex'))
      await CA.sync()
      expect(CA.location).to.equal(CA.origin)
    })

    // --------------------------------------------------------------------------

    it('sync while replaying', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      const a = new A()
      await a.sync()
      run.cache = new LocalCache()
      let syncPromise = null
      // Stub the cache set so that we know we're somewhere in the middle of replaying
      stub(run.cache, 'set').callsFake(async () => { syncPromise = run.sync() })
      await run.load(a.location)
      await syncPromise
    })

    // --------------------------------------------------------------------------

    it('no infinite loops during forward sync inner jigs', async () => {
      const run = new Run()

      class A extends Jig { set (x) { this.x = x } }
      const a = new A()
      const b = new A()
      a.set(b)
      await a.sync()
      const ao = await run.load(a.origin)
      b.set(ao)
      await b.sync()

      // ao will be synced to a newer state where it has CB set
      // but b will refer back to ao again
      await ao.sync()

      expect(ao.location).to.equal(ao.x.x.location)
      expect(ao.x.location).to.equal(ao.x.x.x.location)
    })

    // --------------------------------------------------------------------------

    it('no infinite loops during forward sync inner code', async () => {
      const run = new Run()

      class A extends Jig { static set (x) { this.x = x } }
      class B extends Jig { static set (x) { this.x = x } }
      const CA = await run.deploy(A)
      const CB = await run.deploy(B)
      CA.set(CB)
      await CA.sync()
      const CAO = await run.load(CA.origin)
      CB.set(CAO)
      await CB.sync()

      // CAO will be synced to a newer state where it has CB set
      // but CB will refer back to CAO again
      await CAO.sync()

      expect(CAO.location).to.equal(CAO.x.x.location)
      expect(CAO.x.location).to.equal(CAO.x.x.x.location)
    })

    // --------------------------------------------------------------------------

    it('sync during publish does not inner sync by default', async () => {
      const run = new Run()
      const A2 = run.deploy(class A extends Jig { })
      A2.auth()
      await A2.sync()
      const A1 = await run.load(A2.origin)
      const a = new A1()
      await a.sync()
      expect(a.constructor.location).to.equal(A1.origin)
    })

    // --------------------------------------------------------------------------

    it('sync during publish with inner true syncs inner', async () => {
      const run = new Run()
      const A2 = run.deploy(class A extends Jig { })
      A2.auth()
      await A2.sync()
      const A1 = await run.load(A2.origin)
      const a = new A1()
      await a.sync({ inner: true })
      expect(a.constructor.location).to.equal(A2.location)
    })
  })

  // --------------------------------------------------------------------------
  // Code
  // --------------------------------------------------------------------------

  describe('Code', () => {
    it('sidekick class', async () => {
      const run = new Run()
      class A {}
      run.deploy(A)
      await run.sync()
      const A2 = await run.load(A.location)
      expect(A2.toString()).to.equal(A.toString())
      expect(A2.origin).to.equal(A.origin)
      expect(A2.location).to.equal(A.location)
    })

    // ------------------------------------------------------------------------

    it('deploys code', async () => {
      new Run() // eslint-disable-line
      class A { }
      const CA = Run.util.install(A)
      await CA.sync()
      expect(CA.location.length).to.equal(67)
    })

    // ------------------------------------------------------------------------

    it('throws if called inside', () => {
      const run = new Run()
      class A extends Jig { static f () { this.sync() } }
      const CA = run.deploy(A)
      expect(() => CA.f()).to.throw('sync cannot be called internally')
    })
  })

  // --------------------------------------------------------------------------
  // Jig
  // --------------------------------------------------------------------------

  describe('Jig', () => {
    it('basic jig', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const a2 = await a.sync()
      expect(a).to.equal(a2)
      expect(A.origin.length).to.equal(67)
      expect(A.origin.endsWith('_o1')).to.equal(true)
      expect(A.location.length).to.equal(67)
      expect(A.location.endsWith('_o1')).to.equal(true)
      expect(a.origin.length).to.equal(67)
      expect(a.origin.endsWith('_o2')).to.equal(true)
      expect(a.location.length).to.equal(67)
      expect(a.location.endsWith('_o2')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('throws if called inside', () => {
      new Run() // eslint-disable-line
      class A extends Jig { init () { this.sync() } }
      class B extends Jig { f () { this.sync() } }
      expect(() => new A()).to.throw('sync cannot be called internally')
      const b = new B()
      expect(() => b.f()).to.throw('sync cannot be called internally')
    })

    // ------------------------------------------------------------------------

    it('sync jig updated by another', async () => {
      const run = new Run()
      class A extends Jig {
        set (x) { this.x = x }
      }
      class B extends Jig {
        init (a) { this.a = a }
        setA (x) { this.a.set(x) }
      }
      const a = new A()
      const b = new B(a)
      b.setA(1)
      await run.sync()
      const a2 = await run.load(a.origin)
      await expect(a2.sync()).not.to.be.rejected
    })
  })
})

// ------------------------------------------------------------------------------------------------
