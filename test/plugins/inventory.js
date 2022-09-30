/**
 * inventory.js
 *
 * Tests for lib/plugins/inventory.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { payFor } = require('../env/misc')
const { expect } = require('chai')
const { stub } = require('sinon')
const { PrivateKey, Transaction } = require('bsv')
const Run = require('../env/run')
const { bsv } = require('../../lib/run')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Inventory
// ------------------------------------------------------------------------------------------------

describe('Inventory', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // update
  // --------------------------------------------------------------------------

  describe('update', () => {
    it('adds synced jigs', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      expect(run.inventory.jigs).to.deep.equal([a])
      expect(run.inventory.code).to.deep.equal([Run.util.install(A)])
    })

    // ------------------------------------------------------------------------

    it('does not add unowned jigs', () => {
      const run = new Run()
      class A extends Jig { init (owner) { this.owner = owner } }
      new A(new PrivateKey().publicKey.toString()) // eslint-disable-line
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('does not add unowned jigs with locks', async () => {
      const run = new Run()
      class A extends Jig { init (owner) { this.owner = owner } }
      class CustomLock {
        script () { return '' }
        domain () { return 0 }
      }
      await run.deploy(CustomLock).sync()
      new A(new CustomLock()) // eslint-disable-line
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('removes jigs sent away', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      await a.sync()
      expect(run.inventory.jigs.length).to.equal(1)
      a.send(new PrivateKey().publicKey.toString())
      await a.sync()
      expect(run.inventory.jigs.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('add unsynced jigs', () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      new A() // eslint-disable-line
      expect(run.inventory.jigs.length).to.equal(1)
      expect(run.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('removes if fail to post', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      stub(run.purse, 'pay').throws()
      await expect(a.sync()).to.be.rejected
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // sync
  // --------------------------------------------------------------------------

  describe('sync', () => {
    it('adds owned jigs', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      await run2.inventory.sync()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('removes unowned jigs', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const a2 = await run2.load(a.location)
      a2.send(new PrivateKey().publicKey.toString())
      await a2.sync()
      expect(run.inventory.jigs.length).to.equal(1)
      await run.inventory.sync()
      expect(run.inventory.jigs.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('replaces with newer jig', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const a2 = await run2.load(a.location)
      a2.f()
      await a2.sync()
      expect(run.inventory.jigs.length).to.equal(1)
      await run.inventory.sync()
      expect(run.inventory.jigs.length).to.equal(1)
      expect(run.inventory.jigs[0].location).to.equal(a2.location)
    })

    // ------------------------------------------------------------------------

    it('dedups syncs', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const start = new Date()
      await run.inventory.sync()
      const time = new Date() - start
      const promises = []
      const start2 = new Date()
      await run.inventory.sync()
      for (let i = 0; i < 1000; i++) {
        promises.push(run.inventory.sync())
      }
      await Promise.all(promises)
      const time2 = new Date() - start2
      expect(Math.abs(time2 - time) < 50).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('non-jig utxo does not throw', async () => {
      const run = new Run()
      const utxos = await run.blockchain.utxos(run.purse.address)
      const tx = await payFor(new Transaction().from(utxos).to(run.owner.address, 1000), run)
      await run.blockchain.broadcast(tx.toString('hex'))
      await run.inventory.sync()
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('dedup sync failure', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      stub(run.blockchain, 'utxos').throws()
      const promise1 = run.inventory.sync()
      const promise2 = run.inventory.sync()
      await expect(promise1).to.be.rejected
      await expect(promise2).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('throws if timeout', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      run2.timeout = 0
      await expect(run2.inventory.sync()).to.be.rejectedWith('inventory sync timeout')
    })

    // ------------------------------------------------------------------------

    it('throws if request error', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      stub(run2.blockchain, 'utxos').throws(new Run.errors.RequestError())
      await expect(run2.inventory.sync()).to.be.rejectedWith(Run.errors.RequestError)
    })
  })

  // --------------------------------------------------------------------------
  // load
  // --------------------------------------------------------------------------

  describe('load', () => {
    it('load via state does not add to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      await run2.load(a.location)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('load via replay does not add to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      run2.cache = new LocalCache()
      await run2.load(a.location)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // jig sync
  // --------------------------------------------------------------------------

  describe('jig sync', () => {
    it('sync after load via state adds to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const a2 = await run2.load(a.location)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      await a2.sync()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('sync after load via replay adds to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      run2.cache = new LocalCache()
      const a2 = await run2.load(a.location)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      await a2.sync()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('publish after import adds to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const rawtx = await run2.blockchain.fetch(a.location.slice(0, 64))
      const transaction = await run2.import(rawtx)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      await transaction.publish()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('sync send does not add', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      a.send(new PrivateKey().publicKey.toString())
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const a2 = await run2.load(a.origin)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      await a2.sync()
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('sync receive adds', async () => {
      const run = new Run()
      const run2 = new Run()
      run.activate()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      a.send(run2.owner.address)
      await a.sync()
      run2.activate()
      const a2 = await run2.load(a.origin)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      await a2.sync()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('sync duplicate only adds once', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const a2 = await run2.load(a.location)
      const a3 = await run2.load(a.location)
      await a2.sync()
      await a3.sync()
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(1)
    })
  })

  // --------------------------------------------------------------------------
  // import
  // --------------------------------------------------------------------------

  describe('import', () => {
    it('does not add to inventory', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const run2 = new Run({ owner: run.owner })
      const rawtx = await run2.blockchain.fetch(a.location.slice(0, 64))
      await run2.import(rawtx)
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // Misc
  // --------------------------------------------------------------------------

  describe('Misc', () => {
    it('new owner new inventory', () => {
      const run = new Run()
      const inventory = run.inventory
      run.owner = new PrivateKey()
      expect(run.inventory).not.to.equal(inventory)
    })

    // ------------------------------------------------------------------------

    it('rollback in transaction', () => {
      const run = new Run()
      expect(() => run.transaction(() => {
        class A extends Jig { }
        new A() // eslint-disable-line
        expect(run.inventory.jigs.length).to.equal(1)
        expect(run.inventory.code.length).to.equal(1)
        throw new Error()
      })).to.throw()
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('send in transaction', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      await run.sync()
      await run.inventory.sync()
      run.transaction(() => {
        expect(run.inventory.jigs.length).to.equal(1)
        expect(run.inventory.code.length).to.equal(1)
        a.send(new PrivateKey().publicKey.toString())
        expect(run.inventory.jigs.length).to.equal(0)
        expect(run.inventory.code.length).to.equal(1)
      })
    })

    // ------------------------------------------------------------------------

    it('receive in transaction', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      await run.sync()
      const run2 = new Run()
      await run2.inventory.sync()
      const tx = new Run.Transaction()
      expect(run2.inventory.jigs.length).to.equal(0)
      expect(run2.inventory.code.length).to.equal(0)
      tx.update(() => a.send(run2.owner.address))
      expect(run2.inventory.jigs.length).to.equal(1)
      expect(run2.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('send after switch run instances', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const a = new A()
      await run.sync()
      const run2 = new Run()
      expect(run.inventory.jigs.length).to.equal(1)
      expect(run.inventory.code.length).to.equal(1)
      const transaction = new Run.Transaction()
      transaction.update(() => a.send(run2.owner.pubkey))
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(1)
      transaction.rollback()
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(1)
      await run.inventory.sync()
      expect(run.inventory.jigs.length).to.equal(1)
      expect(run.inventory.code.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('supports non-async nextOwner', async () => {
      const owner = {
        nextOwner () { return new PrivateKey().toAddress().toString() },
        async sign () { }
      }
      const run = new Run({ owner })
      await run.inventory.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if nextOwner fails', async () => {
      const owner = {
        async nextOwner () { throw new Error('bad owner') },
        async sign (rawtx) { return rawtx }
      }
      const run = new Run({ owner })
      await expect(run.inventory.sync()).to.be.rejectedWith('bad owner')
      run.owner.nextOwner = () => new bsv.PrivateKey().toAddress().toString()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      expect(run.inventory.jigs.length).to.equal(0)
      expect(run.inventory.code.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('throws if nextOwner function doesnt exist', async () => {
      const owner = {
        async owner () { return new PrivateKey().toAddress().toString() },
        async sign () { }
      }
      const run = new Run({ owner })
      await expect(run.inventory.sync()).to.be.rejectedWith('Inventory cannot determine owner')
    })

    // ------------------------------------------------------------------------

    it('bans locations that failed to load', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      await run.sync()
      const run2 = new Run({ trust: [], owner: run.owner.privkey })
      await run2.inventory.sync()
      const value = await run2.cache.get(`ban://${C.location}`)
      expect(typeof value).to.equal('object')
      expect(value.untrusted).to.equal(C.location.slice(0, 64))
      expect(typeof value.reason).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('reloads and unbans banned locations if they are retrusted', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      await run.sync()
      const run2 = new Run({ trust: [], owner: run.owner.privkey })
      await run2.inventory.sync()
      run2.trust(C.origin.slice(0, 64))
      await run2.inventory.sync()
      expect(run2.inventory.code.length).to.equal(1)
      expect(run2.inventory.code[0].location).to.equal(C.location)
      const value = await run2.cache.get(`ban://${C.location}`)
      expect(value).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('loads banned jig from old format', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      await run.sync()
      const run2 = new Run({ owner: run.owner.privkey })
      await run2.cache.set(`ban://${C.location}`, 1)
      run.trust(C.location.slice(0, 64))
      await run2.inventory.sync()
      expect(run2.inventory.code.length).to.equal(1)
      expect(run2.inventory.code[0].location).to.equal(C.location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
