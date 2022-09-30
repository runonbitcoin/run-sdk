/**
 * owner-api.js
 *
 * Tests for the Owner plugin
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const Run = require('../env/run')
const { Jig } = Run
const bsv = require('bsv')

// ------------------------------------------------------------------------------------------------
// Owner API
// ------------------------------------------------------------------------------------------------

describe('Owner API', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  describe('sign', () => {
    it('throws if sign returns invalid tx', async () => {
      const run = new Run()
      class A extends Jig {}
      run.deploy(A)
      await run.sync()
      async function testFail (f) {
        run.owner.sign = f
        const error = 'Invalid raw transaction returned by owner'
        const tx = new Run.Transaction()
        tx.update(() => new A())
        await expect(tx.sign()).to.be.rejectedWith(error)
      }
      await testFail(() => undefined)
      await testFail(() => null)
      await testFail(() => new bsv.Transaction())
      await testFail(() => true)
      await testFail(() => 'abc')
      await testFail(rawtx => new bsv.Transaction(rawtx))
    })

    // ------------------------------------------------------------------------

    it('throws if sign returns different tx', async () => {
      const run = new Run()
      class A extends Jig {
        init () { A.auth() }
      }
      run.deploy(A)
      await run.sync()
      async function testFail (f) {
        run.owner.sign = f
        const error = 'Owner illegally modified tx during payment'
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
  // nextOwner
  // --------------------------------------------------------------------------

  describe('nextOwner', () => {
    it('throws if returns invalid owner', async () => {
      const run = new Run()
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
      async function testFail (owner) {
        run.owner.nextOwner = () => owner
        new A() // eslint-disable-line
        const error = 'Invalid owner'
        await expect(run.sync()).to.be.rejectedWith(error)
      }
      await testFail(undefined)
      await testFail(null)
      await testFail(123)
      await testFail('abc')
      await testFail({})
    })
  })
})

// ------------------------------------------------------------------------------------------------
