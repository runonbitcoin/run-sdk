/**
 * blockchain.js
 *
 * Blockchain API tests that should work across all blockchain implementations
 */

const bsv = require('bsv')
const { describe, it, before, after } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { PrivateKey, Script, Transaction } = bsv

// ------------------------------------------------------------------------------------------------
// Blockchain tests
// ------------------------------------------------------------------------------------------------

describe('Blockchain', () => {
  let spentPurseScript
  let spentPurseUtxos
  let mempoolTx
  let mempoolRawtx
  let mempoolTxid
  let spentAndConfirmedTxid

  // Broadcast a mempool transaction once that we'll check below
  before(async () => {
    const run = new Run()
    spentAndConfirmedTxid = await spentAndConfirmed(run.blockchain)
    spentPurseScript = run.purse.script
    spentPurseUtxos = await run.purse.utxos()
    mempoolTx = randomTx()
    mempoolTx.from(spentPurseUtxos)
    mempoolTx.change(run.purse.address)
    mempoolTx.sign(run.purse.privkey)
    mempoolRawtx = mempoolTx.toString('hex')
    mempoolTxid = await run.blockchain.broadcast(mempoolRawtx)
  })

  // Deactivate the current run instance. This stops leaks across tests.
  after(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('same transaction twice', async () => {
      const run = new Run()
      await run.blockchain.broadcast(mempoolRawtx)
    })

    // ------------------------------------------------------------------------

    it('throws if input never existed', async () => {
      const run = new Run()
      const emptytx = new Transaction()
      const parents = []
      const paidraw = await run.purse.pay(emptytx, parents)
      const badtx = new Transaction(paidraw)
      badtx.inputs[0].outputIndex = 9999
      const badraw = badtx.toString('hex')
      const { ERR_MISSING_INPUTS } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(badraw)).to.be.rejectedWith(ERR_MISSING_INPUTS)
    })

    // ------------------------------------------------------------------------

    it('throws if input is already spent and confirmed', async () => {
      const run = new Run()
      const craw = await run.blockchain.fetch(spentAndConfirmedTxid)
      const ctx = new Transaction(craw)
      const prevtxid = ctx.inputs[0].prevTxId.toString('hex')
      const prevvout = ctx.inputs[0].outputIndex
      const prevraw = await run.blockchain.fetch(prevtxid)
      const prevtx = new bsv.Transaction(prevraw)
      const prevout = prevtx.outputs[prevvout]
      const utxo = { txid: prevtxid, vout: prevvout, script: prevout.script, satoshis: prevout.satoshis }
      const tx = randomTx().from(utxo)
      const rawtx = tx.toString('hex')
      const { ERR_MISSING_INPUTS } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_MISSING_INPUTS)
    })

    // ------------------------------------------------------------------------

    it('throws if input is already spent and not confirmed', async () => {
      const run = new Run()
      const rawtx = new Transaction()
        .from(spentPurseUtxos)
        .addSafeData('2')
        .change(run.purse.address)
        .sign(run.purse.bsvPrivateKey)
        .toString('hex')
      const { ERR_MEMPOOL_CONFLICT } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_MEMPOOL_CONFLICT)
    })

    // ------------------------------------------------------------------------

    it('throws if no inputs', async () => {
      const run = new Run()
      const dummyaddr = new PrivateKey().toAddress().toString()
      const rawtx = new Transaction().to(dummyaddr, 1000).toString('hex')
      const { ERR_NO_INPUTS } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_NO_INPUTS)
    })

    // ------------------------------------------------------------------------

    it('throws if no outputs', async () => {
      const run = new Run()
      const utxos = await run.purse.utxos()
      const rawtx = new Transaction().from(utxos).sign(run.purse.bsvPrivateKey).toString('hex')
      const { ERR_NO_OUTPUTS } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_NO_OUTPUTS)
    })

    // ------------------------------------------------------------------------

    // The latest node does not have a lower fee limit that we can see
    if (Run.defaults.api !== 'whatsonchain' && Run.defaults.api !== 'run') {
      it('throws if fee too low', async () => {
        const run = new Run()
        const utxos = await run.purse.utxos()
        const rawtx = new Transaction()
          .from(utxos)
          .change(run.purse.address)
          .fee(0)
          .sign(run.purse.bsvPrivateKey)
          .toString('hex')
        const { ERR_FEE_TOO_LOW } = errors(run.blockchain)
        await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_FEE_TOO_LOW)
      })
    }

    // ------------------------------------------------------------------------

    it('throws if not enough satoshis', async () => {
      const run = new Run()
      const utxos = await run.purse.utxos()
      const satoshisIn = utxos.reduce((prev, curr) => prev + curr.satoshis, 0)
      const rawtx = new Transaction()
        .from(utxos)
        .to(run.purse.address, satoshisIn + 1)
        .sign(run.purse.bsvPrivateKey)
        .toString('hex')
      const { ERR_TXNS_IN_BELOW_OUT } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_TXNS_IN_BELOW_OUT)
    })

    // ------------------------------------------------------------------------

    it('throws if not signed', async () => {
      const run = new Run()
      const utxos = await run.purse.utxos()
      const rawtx = new Transaction()
        .from(utxos)
        .addSafeData('')
        .change(run.purse.address)
        .toString('hex')
      const { ERR_NOT_SIGNED } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_NOT_SIGNED)
    })

    // ------------------------------------------------------------------------

    it('throws if duplicate input', async () => {
      const run = new Run()
      const utxos = await run.purse.utxos()
      const rawtx = new Transaction()
        .from(utxos)
        .from(utxos)
        .addSafeData('')
        .sign(run.purse.bsvPrivateKey)
        .toString('hex')
      const { ERR_DUP_INPUT } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_DUP_INPUT)
    })

    // ------------------------------------------------------------------------

    it('throws if bad signature', async () => {
      const run = new Run()
      const utxos = await run.purse.utxos()
      const tx = new Transaction()
        .from(utxos)
        .change(run.purse.address)
        .addSafeData('')
      tx.inputs[0].setScript('OP_FALSE')
      const rawtx = tx.toString('hex')
      const { ERR_BAD_SIGNATURE } = errors(run.blockchain)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(ERR_BAD_SIGNATURE)
    })
  })

  // --------------------------------------------------------------------------
  // fetch
  // --------------------------------------------------------------------------

  describe('fetch', () => {
    it('raw transaction', async () => {
      const run = new Run()
      const rawtx = await run.blockchain.fetch(spentAndConfirmedTxid)
      expect(typeof rawtx).to.equal('string')
      const tx = new Transaction(rawtx)
      expect(tx.hash).to.equal(spentAndConfirmedTxid)
    })

    // ------------------------------------------------------------------------

    it('throws if nonexistant', async () => {
      const run = new Run()
      const badid = '0000000000000000000000000000000000000000000000000000000000000001'
      const { ERR_TX_NOT_FOUND } = errors(run.blockchain)
      await expect(run.blockchain.fetch(badid)).to.be.rejectedWith(ERR_TX_NOT_FOUND)
    })

    // ------------------------------------------------------------------------

    it('caches repeated requests', async () => {
      const run = new Run()
      const goodid = spentAndConfirmedTxid
      const badid = '0000000000000000000000000000000000000000000000000000000000000002'
      const good = []
      for (let i = 0; i < 100; i++) {
        good.push(run.blockchain.fetch(goodid))
      }
      await Promise.all(good)
      const bad = []
      for (let i = 0; i < 100; i++) {
        bad.push(run.blockchain.fetch(badid))
      }
      const { ERR_TX_NOT_FOUND } = errors(run.blockchain)
      await expect(Promise.all(bad)).to.be.rejectedWith(ERR_TX_NOT_FOUND)
    })
  })

  // --------------------------------------------------------------------------
  // utxos
  // --------------------------------------------------------------------------

  describe('utxos', () => {
    it('return utxos', async () => {
      const run = new Run()
      const utxos = await run.blockchain.utxos(run.purse.script)
      expect(utxos.length > 0).to.equal(true)
      utxos.forEach(utxo => {
        expect(typeof utxo.txid).to.equal('string')
        expect(typeof utxo.vout).to.equal('number')
        expect(typeof utxo.script).to.equal('string')
        expect(typeof utxo.satoshis).to.equal('number')
      })
    })

    // ------------------------------------------------------------------------

    it('returns empty list if no utxos', async () => {
      const run = new Run()
      const address = new PrivateKey().toAddress()
      const script = Script.fromAddress(address).toHex()
      const utxos = await run.blockchain.utxos(script)
      expect(utxos.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('no spent outputs', async () => {
      const run = new Run()
      const utxos = await run.blockchain.utxos(spentPurseScript)
      const prevtxid = mempoolTx.inputs[0].prevTxId.toString('hex')
      const prevvout = mempoolTx.inputs[0].outputIndex
      expect(utxos.some(utxo => utxo.txid === prevtxid && utxo.vout === prevvout)).to.equal(false)
      expect(utxos.some(utxo => utxo.txid === mempoolTxid && utxo.vout === 1)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('caches repeated requests', async () => {
      const run = new Run()
      const requests = []
      for (let i = 0; i < 1000; i++) {
        requests.push(run.blockchain.utxos(run.purse.script))
      }
      await Promise.all(requests)
    })

    // ------------------------------------------------------------------------

    it('throws for invalid queries', async () => {
      const run = new Run()
      const cases = ['z', '%', [], 123, null, undefined]
      for (const x of cases) {
        await expect(run.blockchain.utxos(x)).to.be.rejected
      }
    })

    // ------------------------------------------------------------------------

    it('large number of UTXOS', async () => {
      const run = new Run()
      const addr = await addressWithManyUtxos(run.blockchain)
      const script = Script.fromAddress(addr).toHex()
      const utxos = await run.blockchain.utxos(script)
      expect(utxos.length > 1220).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // spends
  // --------------------------------------------------------------------------

  describe('spends', () => {
    if (new Run().blockchain.api === 'whatsonchain') return // Not supported

    it('returns mempool spending txid', async () => {
      const run = new Run()
      const prevtxid = mempoolTx.inputs[0].prevTxId.toString('hex')
      const prevvout = mempoolTx.inputs[0].outputIndex
      expect(await run.blockchain.spends(prevtxid, prevvout)).to.equal(mempoolTxid)
    })

    // ------------------------------------------------------------------------

    it('returns mempool unspent as null', async () => {
      const run = new Run()
      expect(await run.blockchain.spends(mempoolTxid, 1)).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('returns block spending txid', async () => {
      const run = new Run()
      const spenttxid = spentAndConfirmedTxid
      const spentrawtx = await run.blockchain.fetch(spenttxid)
      const spenttx = new bsv.Transaction(spentrawtx)
      const prevtxid = spenttx.inputs[0].prevTxId.toString('hex')
      const prevvout = spenttx.inputs[0].outputIndex
      expect(await run.blockchain.spends(prevtxid, prevvout)).to.equal(spenttxid)
    })

    // ------------------------------------------------------------------------

    it('returns block unspent as null', async () => {
      const run = new Run()
      expect(await run.blockchain.spends(spentAndConfirmedTxid, 0)).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('large number of outputs', async () => {
      const run = new Run()
      const txid = await transactionWithManyOutputs(run.blockchain)
      await run.blockchain.spends(txid, 0)
    })
  })

  // --------------------------------------------------------------------------
  // time
  // --------------------------------------------------------------------------

  describe('time', () => {
    it('returns mempool transaction time', async () => {
      const run = new Run()
      const time = await run.blockchain.time(mempoolTxid)
      expect(typeof time).to.equal('number')
      expect(time > new Date('January 3, 2009')).to.equal(true)
      expect(time <= Date.now()).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns block transaction time', async () => {
      const run = new Run()
      const time = await run.blockchain.time(spentAndConfirmedTxid)
      expect(time > new Date('January 3, 2009')).to.equal(true)
      expect(time <= Date.now()).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('throws if txid not found', async () => {
      const run = new Run()
      const badid = '0000000000000000000000000000000000000000000000000000000000000000'
      await expect(run.blockchain.time(badid)).to.be.rejected
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

// Create a transaction with a new random txid
const randomTx = () => new Transaction().addSafeData(Math.random().toString())

function errors (blockchain) {
  const errors = {
    ERR_NO_INPUTS: 'tx has no inputs',
    ERR_NO_OUTPUTS: 'tx has no outputs',
    ERR_FEE_TOO_LOW: 'insufficient priority',
    ERR_TXNS_IN_BELOW_OUT: 'bad-txns-in-belowout',
    ERR_NOT_SIGNED: 'mandatory-script-verify-flag-failed',
    ERR_DUP_INPUT: 'bad-txns-inputs-duplicate',
    ERR_MISSING_INPUTS: 'Missing inputs',
    ERR_MEMPOOL_CONFLICT: 'txn-mempool-conflict',
    ERR_BAD_SIGNATURE: 'mandatory-script-verify-flag-failed',
    ERR_TX_NOT_FOUND: 'No such mempool or blockchain transaction'
  }

  return errors
}

// Gets a txid that spent an input 0 and is confirmed, whose output 0 is unspent
async function spentAndConfirmed (blockchain) {
  switch (blockchain.network) {
    case 'main': return '3bc7b98fb6f8950661454f8bf344e9dafc84d1845f8304e0e436f32b903a234b'
    case 'test': return '2819948748c3ddfc700a528ffc7f62f3ca056b8efd4af445c9ebafa428fcb3e7'
    case 'mock': {
      const privkey = new PrivateKey('testnet')
      const addr = privkey.toAddress().toString()
      const aid = blockchain.fund(addr, 10000)
      const araw = await blockchain.fetch(aid)
      const atx = new Transaction(araw)
      const aout = atx.outputs[1]
      const autxo = { txid: aid, vout: 1, script: aout.script, satoshis: aout.satoshis }
      const btx = new Transaction().from(autxo).change(addr).sign(privkey)
      const braw = btx.toString('hex')
      const bid = await blockchain.broadcast(braw)
      blockchain.block()
      return bid
    }
    default: throw new Error(`No confirmed tx set for network: ${blockchain.network}`)
  }
}

async function addressWithManyUtxos (blockchain) {
  switch (blockchain.network) {
    case 'main': return '14kPnFashu7rYZKTXvJU8gXpJMf9e3f8k1'
    case 'test': return 'mxAtZKePTbXJC6GkbDV5SePyHANUswfhKK'
    case 'mock': {
      const privkey = new PrivateKey()
      const addr = privkey.toAddress()
      const fundid = blockchain.fund(addr, 100000000)
      const fundraw = await blockchain.fetch(fundid)
      const fundtx = new Transaction(fundraw)
      const fundout = fundtx.outputs[1]
      const fundutxo = { txid: fundid, vout: 1, script: fundout.script, satoshis: fundout.satoshis }
      const largetx = randomTx()
      largetx.from(fundutxo)
      for (let i = 0; i < 1500; i++) {
        largetx.to(addr, Transaction.DUST_AMOUNT)
      }
      largetx.sign(privkey)
      const largeraw = largetx.toString('hex')
      await blockchain.broadcast(largeraw)
      return addr
    }
  }
}

async function transactionWithManyOutputs (blockchain) {
  switch (blockchain.network) {
    case 'main': return 'cb6b87526c31540ced3584a558eb31e1a119a121e2cbcd8f657cc8e5853845b1'
    case 'test': return 'f3584a4c0b29af9d642750b5a3ea757ee6e24ed936d8abd42ff5740dc669f459'
    case 'mock': {
      const privkey = new PrivateKey()
      const addr = privkey.toAddress()
      const fundid = blockchain.fund(addr, 100000000)
      const fundraw = await blockchain.fetch(fundid)
      const fundtx = new Transaction(fundraw)
      const fundout = fundtx.outputs[1]
      const fundutxo = { txid: fundid, vout: 1, script: fundout.script, satoshis: fundout.satoshis }
      const largetx = randomTx()
      largetx.from(fundutxo)
      for (let i = 0; i < 500; i++) {
        largetx.to(addr, Transaction.DUST_AMOUNT)
      }
      largetx.sign(privkey)
      const largeraw = largetx.toString('hex')
      await blockchain.broadcast(largeraw)
      return largetx.hash
    }
  }
}

// ------------------------------------------------------------------------------------------------
