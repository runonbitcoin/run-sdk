/**
 * misc.js
 *
 * Test helpers
 */

const { Transaction } = require('bsv')
const fs = require('fs')
const path = require('path')
const Run = require('./run')
const unmangle = require('./unmangle')
const { expect } = require('chai')
const { Mockchain } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

let EXTRAS_MOCKCHAIN = null

// ------------------------------------------------------------------------------------------------
// payFor
// ------------------------------------------------------------------------------------------------

async function payFor (tx, run) {
  const rawtx = tx.toString('hex')
  const prevtxids = tx.inputs.map(input => input.prevTxId.toString('hex'))
  const prevrawtxs = await Promise.all(prevtxids.map(txid => run.blockchain.fetch(txid)))
  const prevtxs = prevrawtxs.map(rawtx => new Transaction(rawtx))
  const parents = tx.inputs.map((input, n) => {
    const output = prevtxs[n].outputs[input.outputIndex]
    return { satoshis: output.satoshis, script: output.script.toHex() }
  })
  const paidhex = await run.purse.pay(rawtx, parents)
  const paidtx = new Transaction(paidhex)
  await populatePreviousOutputs(paidtx, run.blockchain)
  const signedtx = paidtx.sign(run.purse.bsvPrivateKey)
  return signedtx
}

// ------------------------------------------------------------------------------------------------
// populatePreviousOutputs
// ------------------------------------------------------------------------------------------------

/**
 * Adds the previous output information for each input to sign and verify the transaction.
 * @param {bsv.Transaction} tx Tx to modify
 * @param {Blockchain} blockchain Blockchain to fetch inputs
 */
async function populatePreviousOutputs (tx, blockchain) {
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i]

    if (!input.output) {
      const prevtxid = input.prevTxId.toString('hex')
      const prevraw = await blockchain.fetch(prevtxid)
      const prevtx = new Transaction(prevraw)

      // Add the output, which gives us the script and satoshis
      input.output = prevtx.outputs[input.outputIndex]

      // Set the type of the input if we can determine it.
      // Run doesn't require this to work but it may help users.
      if (input.output.script.isPublicKeyHashOut()) {
        Reflect.setPrototypeOf(input, Transaction.Input.PublicKeyHash.prototype)
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// expectTx
// ------------------------------------------------------------------------------------------------

/**
 * Checks the metadata in next Run transaction broadcast
 *
 * @param {object} opts
 * @param {?number} nin Number of inputs
 * @param {?number} nref Number of references
 * @param {?Array} out Output hashes
 * @param {?Array} del Deleted hashes
 * @param {?Array} ncre Number of creates
 * @param {?Array} cre Creates array
 * @param {?Array} exec Program instructions
 */
function expectTx (opts) {
  const run = Run.instance

  function verify (rawtx) {
    const metadata = Run.util.metadata(rawtx)
    try {
      if ('nin' in opts) expect(metadata.in).to.equal(opts.nin, 'bad nin')
      if ('nref' in opts) expect(metadata.ref.length).to.equal(opts.nref, 'bad nref')
      if ('ref' in opts) expect(metadata.ref).to.deep.equal(opts.ref, 'bad ref')
      if ('nout' in opts) expect(metadata.out.length).to.equal(opts.nout, 'bad nout')
      if ('ndel' in opts) expect(metadata.del.length).to.equal(opts.ndel, 'bad ndel')
      if ('ncre' in opts) expect(metadata.cre.length).to.equal(opts.ncre, 'bad ncre')
      if ('cre' in opts) expect(metadata.cre).to.deep.equal(opts.cre, 'bad cre')
      if ('exec' in opts) expect(metadata.exec).to.deep.equal(opts.exec, 'bad exec')
    } catch (e) {
      console.log('Broadcast RUN metadata:', JSON.stringify(metadata, 0, 3))
      throw e
    }
  }

  // Hook run.blockchain to verify the next transaction then disable the hook
  const oldBroadcast = run.blockchain.broadcast
  run.blockchain.broadcast = rawtx => {
    run.blockchain.broadcast = oldBroadcast
    verify(rawtx)
    return oldBroadcast.call(run.blockchain, rawtx)
  }
}

// ------------------------------------------------------------------------------------------------
// testRecord
// ------------------------------------------------------------------------------------------------

// Helper to test recording calls and then roll back any changes
function testRecord (f) {
  if (!Run.instance) new Run() // eslint-disable-line
  const Record = unmangle(unmangle(Run)._Record)
  const CURRENT_RECORD = unmangle(Record._CURRENT_RECORD)
  try {
    CURRENT_RECORD._begin()
    return f(CURRENT_RECORD)
  } finally {
    CURRENT_RECORD._rollback()
  }
}

// ------------------------------------------------------------------------------------------------
// getTestExtrasBlockchain
// ------------------------------------------------------------------------------------------------

// If on mock, pre-deploy the built-in classes to a common mockchain and make
// that mockchain available for those tests that need it.
async function getTestExtrasBlockchain () {
  if (Run.defaults.network !== 'mock') return undefined

  if (EXTRAS_MOCKCHAIN) return EXTRAS_MOCKCHAIN

  EXTRAS_MOCKCHAIN = new Mockchain()

  return EXTRAS_MOCKCHAIN
}

// ------------------------------------------------------------------------------------------------
// createTestExtrasCache
// ------------------------------------------------------------------------------------------------

async function createTestExtrasCache () {
  const cache = new Run.plugins.LocalCache()

  for (const [key, value] of Object.entries(Run.extra.test.states)) {
    await cache.set(key, value)
  }

  cache.testExtras = true

  return cache
}

// ------------------------------------------------------------------------------------------------
// createTestExtrasRun
// ------------------------------------------------------------------------------------------------

async function createTestExtrasRun () {
  const reuseExistingCache = Run.instance && Run.instance.cache && Run.instance.cache.testExtras

  const run = new Run({
    blockchain: await getTestExtrasBlockchain(),
    cache: reuseExistingCache ? Run.instance.cache : await createTestExtrasCache(),
    preverify: false,
    trust: ['state']
  })

  return run
}

// ------------------------------------------------------------------------------------------------
// rmrfSync
// ------------------------------------------------------------------------------------------------

function rmrfSync (dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file, index) => {
      const subpath = path.join(dir, file)
      if (fs.lstatSync(subpath).isDirectory()) {
        rmrfSync(subpath)
      } else {
        fs.unlinkSync(subpath)
      }
    })
    fs.rmdirSync(dir)
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  populatePreviousOutputs,
  payFor,
  expectTx,
  testRecord,
  getTestExtrasBlockchain,
  createTestExtrasCache,
  createTestExtrasRun,
  rmrfSync
}
