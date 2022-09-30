/**
 * replay.js
 *
 * Tests for replaying and verifying transactions
 */

const { describe, it, afterEach } = require('mocha')
const { stub } = require('sinon')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const { payFor, createTestExtrasRun } = require('../env/misc')
const { Jig } = Run
const { Mockchain, LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Replay
// ------------------------------------------------------------------------------------------------

describe('Replay', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // ------------------------------------------------------------------------

  it('prints debugging information for metadata mismatch', async () => {
    const run = new Run()

    class MalleatingMockchain extends Mockchain {
      async broadcast (rawtx) {
        // Extract and modify the hash of one of the states
        const tx = new bsv.Transaction(rawtx)
        const metadata = tx.outputs[0].script.chunks[5]
        const metadataJson = JSON.parse(metadata.buf.toString('utf8'))
        metadataJson.out[0] = '0000000000000000000000000000000000000000000000000000000000000000'

        // Recreate a new metadata
        const Buffer = bsv.deps.Buffer
        const prefix = Buffer.from('run', 'utf8')
        const protocol = Buffer.from([Run.protocol], 'hex')
        const app = Buffer.from('', 'utf8')
        const metadata2 = Buffer.from(JSON.stringify(metadataJson), 'utf8')
        const script = bsv.Script.buildSafeDataOut([prefix, protocol, app, metadata2])
        const metadataOutput = new bsv.Transaction.Output({ script, satoshis: 0 })

        const malleated = new bsv.Transaction()
        malleated.addOutput(metadataOutput)
        const paid = await payFor(malleated, run)

        const rawpaid = paid.toString('hex')
        const txid2 = await super.broadcast(rawpaid)
        return txid2
      }
    }

    run.blockchain = new MalleatingMockchain()
    const logger = { error: () => { } }
    stub(logger, 'error')
    run.logger = logger

    class A extends Jig { }
    const a = new A()
    await run.sync()

    run.cache = new LocalCache()
    await expect(run.load(a.location)).to.be.rejectedWith('Metadata mismatch')

    const hasErrorMessage = x => logger.error.args.some(args => args.join().indexOf('State mismatch') !== -1)
    expect(hasErrorMessage('Expected metadata')).to.equal(true)
    expect(hasErrorMessage('Actual metadata')).to.equal(true)
    expect(hasErrorMessage('State mismatch')).to.equal(true)
  })

  // ------------------------------------------------------------------------

  it('many actions', async () => {
    class A extends Run.extra.test.Token { }
    const run = await createTestExtrasRun()
    run.preverify = false
    run.deploy(A)
    const a = A.mint(1000000)
    await a.sync()
    run.transaction(() => {
      for (let i = 0; i < 200; i++) {
        a.send(run.purse.address, 50)
      }
    })
    await run.sync()
  })
})

// ------------------------------------------------------------------------------------------------
