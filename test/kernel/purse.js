/**
 * purse.js
 *
 * Test for universal purse functionality in relation to the kernel
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const bsv = require('bsv')
const Run = require('../env/run')
const { Jig } = Run
const { spy } = require('sinon')

// ------------------------------------------------------------------------------------------------
// Purse
// ------------------------------------------------------------------------------------------------

describe('Purse', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  describe('pay', () => {
    it('called when create jig', async () => {
      const run = new Run()
      spy(run.purse)
      run.deploy(class A { })
      await run.sync()
      expect(run.purse.pay.callCount).to.equal(1)
      const rawtx = run.purse.pay.args[0][0]
      const parents = run.purse.pay.args[0][1]
      expect(typeof rawtx).to.equal('string')
      expect(rawtx.length > 0).to.equal(true)
      const tx = new bsv.Transaction(rawtx)
      expect(tx.inputs.length).to.equal(0)
      expect(tx.outputs.length).to.equal(2)
      expect(Array.isArray(parents)).to.equal(true)
      expect(parents.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('called when update jig', async () => {
      const run = new Run()
      class A extends Jig {
        f () { this.n = 1 }
      }
      const a = new A()
      await run.sync()
      spy(run.purse)
      a.f()
      await run.sync()
      expect(run.purse.pay.callCount).to.equal(1)
      const rawtx = run.purse.pay.args[0][0]
      const parents = run.purse.pay.args[0][1]
      expect(typeof rawtx).to.equal('string')
      expect(rawtx.length > 0).to.equal(true)
      const tx = new bsv.Transaction(rawtx)
      expect(tx.inputs.length).to.equal(1)
      expect(tx.outputs.length).to.equal(2)
      expect(Array.isArray(parents)).to.equal(true)
      expect(parents.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('called when destroy jig', async () => {
      const run = new Run()
      const CA = run.deploy(class A {})
      await run.sync()
      spy(run.purse)
      CA.destroy()
      await run.sync()
      expect(run.purse.pay.callCount).to.equal(1)
      const rawtx = run.purse.pay.args[0][0]
      const parents = run.purse.pay.args[0][1]
      expect(typeof rawtx).to.equal('string')
      expect(rawtx.length > 0).to.equal(true)
      const tx = new bsv.Transaction(rawtx)
      expect(tx.inputs.length).to.equal(1)
      expect(tx.outputs.length).to.equal(1)
      expect(Array.isArray(parents)).to.equal(true)
      expect(parents.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('called with parents', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      const parentRawtx = await run.blockchain.fetch(a.location.slice(0, 64))
      const parentTx = new bsv.Transaction(parentRawtx)
      spy(run.purse)
      a.auth()
      await run.sync()
      expect(run.purse.pay.callCount).to.equal(1)
      const parents = run.purse.pay.args[0][1]
      expect(Array.isArray(parents)).to.equal(true)
      expect(parents.length).to.equal(1)
      expect(parents[0].script).to.equal(parentTx.outputs[1].script.toHex())
      expect(parents[0].satoshis).to.equal(parentTx.outputs[1].satoshis)
    })

    // ------------------------------------------------------------------------

    it('called during transaction pay', async () => {
      const run = new Run()
      spy(run.purse)
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      expect(run.purse.pay.callCount).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('called for each transaction pay', async () => {
      const run = new Run()
      spy(run.purse)
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.pay()
      await tx.pay()
      expect(run.purse.pay.callCount).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('called during transaction publish', async () => {
      const run = new Run()
      spy(run.purse)
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.publish()
      expect(run.purse.pay.callCount).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('called during transaction export', async () => {
      const run = new Run()
      spy(run.purse)
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.export()
      expect(run.purse.pay.callCount).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('long mempool chain', async () => {
      const run = new Run()
      class A extends Jig { }
      for (let i = 0; i < 100; i++) { new A() } // eslint-disable-line
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('passes paid transaction to sign()', async () => {
      const run = new Run()
      spy(run.purse)
      spy(run.owner)
      class A extends Jig { f () { this.n = true } }
      const a = new A()
      await a.sync()
      const rawtx = await run.purse.pay.returnValues[0]
      expect(run.owner.sign.calledOnce).to.equal(true)
      expect(run.owner.sign.args[0][0]).to.equal(rawtx)
    })

    // ------------------------------------------------------------------------

    it('throws if return non-transaction', async () => {
      const run = new Run()
      class A extends Jig {}
      run.deploy(A)
      await run.sync()
      async function testFail (f) {
        run.purse.pay = f
        const error = 'Invalid raw transaction returned by purse'
        const a = new A()
        await expect(a.sync()).to.be.rejectedWith(error)
      }
      await testFail(() => undefined)
      await testFail(() => null)
      await testFail(() => new bsv.Transaction())
      await testFail(() => true)
      await testFail(() => 'abc')
      await testFail(rawtx => new bsv.Transaction(rawtx))
    })

    // ------------------------------------------------------------------------

    it('throws if return modified transaction', async () => {
      const run = new Run()
      class A extends Jig {
        init () { A.auth() }
      }
      run.deploy(A)
      await run.sync()
      async function testFail (f) {
        run.purse.pay = f
        const error = 'Purse illegally modified tx during payment'
        const a = new A()
        await expect(a.sync()).to.be.rejectedWith(error)
      }
      await testFail(() => new bsv.Transaction().toString())
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.nLockTime = tx.nLockTime + 1
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.version = tx.version + 1
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.inputs = []
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.inputs[0].sequenceNumber = 123
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.inputs[0].outputIndex = tx.inputs[0].outputIndex + 1
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        tx.outputs = []
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        const script = new bsv.Script()
        const satoshis = tx.outputs[0].satoshis
        tx.outputs[0] = new bsv.Transaction.Output({ script, satoshis })
        return tx.toString()
      })
      await testFail(rawtx => {
        const tx = new bsv.Transaction(rawtx)
        const script = tx.outputs[0].script
        const satoshis = tx.outputs[0].satoshis + 1
        tx.outputs[0] = new bsv.Transaction.Output({ script, satoshis })
        return tx.toString()
      })
    })
  })

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('called with final tx', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      let broadcasted = null
      run.purse.broadcast = async rawtx => { broadcasted = rawtx }
      a.auth()
      await run.sync()
      const tx = new bsv.Transaction(broadcasted)
      expect(tx.hash).to.equal(a.location.slice(0, 64))
      expect(tx.inputs.length >= 2).to.equal(true)
      expect(tx.outputs.length >= 3).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('called before blockchain broadcast', async () => {
      const run = new Run()
      let beforeBlockchainBroadcast = null
      spy(run.blockchain)
      run.purse.broadcast = async rawtx => { beforeBlockchainBroadcast = !run.blockchain.broadcast.called }
      class A { }
      run.deploy(A)
      await run.sync()
      expect(beforeBlockchainBroadcast).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('called publishing imported transactions', async () => {
      const run = new Run()
      run.purse.broadcast = () => { }
      spy(run.purse)
      class Dragon extends Jig { }
      const tx = new Run.Transaction()
      tx.update(() => new Dragon())
      const rawtx = await tx.export({ pay: false, sign: false })
      tx.rollback()
      expect(run.purse.pay.called).to.equal(false)
      expect(run.purse.broadcast.called).to.equal(false)
      const tx2 = await run.import(rawtx)
      await tx2.pay()
      await tx2.sign()
      await tx2.publish()
      expect(run.purse.pay.called).to.equal(true)
      expect(run.purse.broadcast.called).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('throw will stop publish', async () => {
      const run = new Run()
      run.purse.broadcast = async rawtx => { throw new Error('abc') }
      class A { }
      const C = run.deploy(A)
      await expect(run.sync()).to.be.rejectedWith('abc')
      expect(() => C.nonce).to.throw('Deploy failed')
    })

    // ------------------------------------------------------------------------

    it('throw will rollback', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      run.purse.broadcast = async rawtx => { throw new Error('abc') }
      a.auth()
      await expect(run.sync()).to.be.rejectedWith('abc')
      expect(a.nonce).to.equal(1)
      expect(a.location).to.equal(a.origin)
    })

    // ------------------------------------------------------------------------

    it('supports no broadcast method', async () => {
      const run = new Run()
      run.purse.broadcast = undefined
      run.deploy(class A { })
      await run.sync()
    })
  })

  // --------------------------------------------------------------------------
  // cancel
  // --------------------------------------------------------------------------

  describe('cancel', () => {
    it('called if sign fails', async () => {
      const run = new Run()
      run.purse.cancel = () => { }
      spy(run.purse)
      run.owner.sign = () => { throw new Error('abc') }
      run.deploy(class A { })
      await expect(run.sync()).to.be.rejected
      expect(run.purse.cancel.callCount).to.equal(1)
      const paidtx = await run.purse.pay.returnValues[0]
      expect(run.purse.cancel.args[0][0]).to.equal(paidtx)
    })

    // ------------------------------------------------------------------------

    it('called if sign returns an invalid transaction', async () => {
      const run = new Run()
      run.purse.cancel = () => { }
      spy(run.purse)
      run.owner.sign = () => '123'
      run.deploy(class A { })
      await expect(run.sync()).to.be.rejected
      expect(run.purse.cancel.callCount).to.equal(1)
      const paidtx = await run.purse.pay.returnValues[0]
      expect(run.purse.cancel.args[0][0]).to.equal(paidtx)
    })

    // ------------------------------------------------------------------------

    it('called if sign fails during transaction publish', async () => {
      const run = new Run()
      run.purse.cancel = () => { }
      spy(run.purse)
      run.owner.sign = () => { throw new Error('abc') }
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await expect(tx.publish()).to.be.rejected
      expect(run.purse.cancel.callCount).to.equal(1)
      const paidtx = await run.purse.pay.returnValues[0]
      expect(run.purse.cancel.args[0][0]).to.equal(paidtx)
    })

    // ------------------------------------------------------------------------

    it('called if sign returns an invalid transaction during transaction export', async () => {
      const run = new Run()
      run.purse.cancel = () => { }
      spy(run.purse)
      run.owner.sign = () => '123'
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      await expect(tx.export()).to.be.rejected
      expect(run.purse.cancel.callCount).to.equal(1)
      const paidtx = await run.purse.pay.returnValues[0]
      expect(run.purse.cancel.args[0][0]).to.equal(paidtx)
    })

    // ------------------------------------------------------------------------

    it('called if broadcast fails', async () => {
      const run = new Run()
      run.purse.cancel = () => { }
      spy(run.purse)
      run.blockchain.broadcast = () => { throw new Error('abc') }
      run.deploy(class A { })
      await expect(run.sync()).to.be.rejected
      expect(run.purse.cancel.callCount).to.equal(1)
      const paidtx = await run.purse.pay.returnValues[0]
      expect(run.purse.cancel.args[0][0]).to.equal(paidtx)
    })

    // ------------------------------------------------------------------------

    it('supports no cancel method', async () => {
      const run = new Run()
      run.purse.cancel = undefined
      run.owner.sign = () => { throw new Error('abc') }
      run.deploy(class A { })
      await expect(run.sync()).to.be.rejectedWith('abc')
    })
  })

  // --------------------------------------------------------------------------
  // Backed jigs
  // --------------------------------------------------------------------------

  describe('Backed jigs', () => {
    it('backs jig', async () => {
      const run = new Run()
      class A extends Jig {
        f (satoshis) { this.satoshis = satoshis }
      }
      const a = new A()
      await run.sync()
      a.f(5000)
      await run.sync()
      const rawtx = await run.blockchain.fetch(a.location.slice(0, 64))
      const tx = new bsv.Transaction(rawtx)
      expect(tx.outputs[1].satoshis).to.equal(5000)
    })

    // ------------------------------------------------------------------------

    it('decreases satoshis', async () => {
      const run = new Run()
      class A extends Jig {
        init (satoshis) { this.satoshis = satoshis }
        f () { this.satoshis = 0 }
      }
      const a = new A(5000)
      await run.sync()
      a.f()
      await run.sync()
      const rawtx = await run.blockchain.fetch(a.location.slice(0, 64))
      const tx = new bsv.Transaction(rawtx)
      expect(tx.outputs[1].satoshis < 1000).to.equal(true)
      expect(tx.outputs[2].satoshis > 3000).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('destroys backed jig', async () => {
      const run = new Run()
      class A extends Jig {
        init (satoshis) { this.satoshis = satoshis }
      }
      const a = new A(5000)
      await run.sync()
      a.destroy()
      await run.sync()
      const rawtx = await run.blockchain.fetch(a.location.slice(0, 64))
      const tx = new bsv.Transaction(rawtx)
      expect(tx.outputs[1].satoshis > 3000).to.equal(true)
    })
  })
})

// ------------------------------------------------------------------------------------------------
