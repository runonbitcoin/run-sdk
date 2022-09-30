/**
 * local-purse.js
 *
 * Default implementation of the Purse API
 */

const bsv = require('bsv')
const { PrivateKey, Script, Transaction } = bsv
const { _bsvNetwork, _text } = require('../kernel/misc')
const Log = require('../kernel/log')
const { _signature } = require('../kernel/bsv')
const PurseWrapper = require('./purse-wrapper')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'LocalPurse'

// Script: PUSH + SIG + PUSH + PUBKEY
const P2PKH_SIGSCRIPT_SIZE = 1 + 73 + 1 + 33

// Output: Satoshis + Varint + Script
// Script: OP_DUP + OP_HASH16 + PUSH + HASH + OP_EQUAL + OP_CHECKSIG
const P2PKH_OUTPUT_SIZE = 8 + 1 + 1 + 1 + 1 + 20 + 1 + 1

// Input: Outpoint + Push + Signature + Sequence
const P2PKH_INPUT_SIZE = 36 + 1 + P2PKH_SIGSCRIPT_SIZE + 4

// A default sigscript size when we don't know. Allows up to 3-3 multisig.
const DEFAULT_UNLOCK_SCRIPT_SIZE = 500

// ------------------------------------------------------------------------------------------------
// Local Purse
// ------------------------------------------------------------------------------------------------

/**
 * Local wallet that implements the Purse API
 *
 * It will automatically split UTXOs to avoid the mempool chain limit. However, by design, it will
 * not consolidate UTXOs back together to lower the number of splits. That has to be done outside
 * of the purse. 'splits' should be thought of as minimum splits.
 */
class LocalPurse extends PurseWrapper {
  /**
   * Creates a new LocalPurse
   * @param {object} options Purse configuration
   * @param {Blockchain} options.blockchain Blockchain API (required)
   * @param {string} options.privkey Private key string
   * @param {?number} options.splits Minimum number of UTXO splits. Default: 10.
   * @param {?feePerKb} options.feePerKb Transaction fee in satoshis per kilobyte. Default: 1000.
   */
  constructor (options = {}) {
    super(undefined, parseBlockchain(options.blockchain))

    this._splits = parseSplits(options.splits)
    this._feePerKb = parseFeePerKb(options.feePerKb)

    this.bsvPrivateKey = new PrivateKey(options.privkey, _bsvNetwork(this.blockchain.network))
    this.bsvAddress = this.bsvPrivateKey.toAddress()
    this.bsvScript = Script.fromAddress(this.bsvAddress)

    this.privkey = this.bsvPrivateKey.toString()
    this.address = this.bsvAddress.toString()
    this.script = this.bsvScript.toHex()

    // If the private key does not match what's passed in, then it's not a private key
    if (options.privkey && this.bsvPrivateKey.toString() !== options.privkey.toString()) {
      throw new Error(`Invalid private key: ${_text(options.privkey)}`)
    }

    this.jigFilter = true
    this.cacheUtxos = true

    this._utxos = []
    this._pendingSpends = new Map() // rawtx -> []
  }

  // --------------------------------------------------------------------------

  get splits () { return this._splits }
  set splits (value) { this._splits = parseSplits(value) }

  get feePerKb () { return this._feePerKb }
  set feePerKb (value) { this._feePerKb = parseFeePerKb(value) }

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  async pay (rawtx, parents) {
    if (!this.cacheUtxos || !this._utxos.length) {
      // Some of these UTXOs may not be purse outputs. We filter below.
      this._utxos = await this.blockchain.utxos(this.script)
      this._pendingSpends.clear()
    }

    const tx = new bsv.Transaction(rawtx)
    const numInputsBefore = tx.inputs.length

    const paidTx = await payWithUtxos(tx, parents, this._utxos, this.blockchain, this.bsvPrivateKey, this.bsvAddress,
      this.feePerKb, this.splits, this.jigFilter)

    const paidHex = paidTx.toString()

    if (this.cacheUtxos) {
      const pendingSpends = []

      for (let i = numInputsBefore; i < tx.inputs.length; i++) {
        const input = tx.inputs[i]
        const txid = input.prevTxId.toString('hex')
        const vout = input.outputIndex
        const utxoIndex = this._utxos.findIndex(utxo => utxo.txid === txid && utxo.vout === vout)
        const utxo = this._utxos[utxoIndex]
        this._utxos.splice(utxoIndex, 1)
        pendingSpends.push(utxo)
      }

      this._pendingSpends.set(paidHex, pendingSpends)
    }

    return paidHex
  }

  // --------------------------------------------------------------------------
  // broadcast
  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    // Broadcast the transaction
    await this.blockchain.broadcast(rawtx)

    if (!this.cacheUtxos) return

    // Add new UTXOs

    const tx = new bsv.Transaction(rawtx)
    const txid = tx.hash

    tx.outputs.forEach((output, vout) => {
      if (output.script.toHex() !== this.script) return

      this._utxos.push({
        txid,
        vout,
        script: this.script,
        satoshis: output.satoshis
      })
    })

    this._pendingSpends.delete(rawtx)
  }

  // --------------------------------------------------------------------------
  // cancel
  // --------------------------------------------------------------------------

  async cancel (rawtx) {
    if (!this.cacheUtxos) return

    // Add back spent UTXOs

    const pendingSpends = this._pendingSpends.get(rawtx)

    if (pendingSpends) pendingSpends.forEach(utxo => this._utxos.push(utxo))

    this._pendingSpends.delete(rawtx)
  }

  // --------------------------------------------------------------------------
  // balance
  // --------------------------------------------------------------------------

  async balance () {
    return (await this.utxos()).reduce((sum, utxo) => sum + utxo.satoshis, 0)
  }

  // --------------------------------------------------------------------------
  // utxos
  // --------------------------------------------------------------------------

  async utxos () {
    if (!this.cacheUtxos || !this._utxos.length) {
      this._utxos = await this.blockchain.utxos(this.script)
      this._pendingSpends.clear()
    }

    const txns = await Promise.all(this._utxos.map(o => this.blockchain.fetch(o.txid)))

    return this._utxos.filter((o, i) => !this.jigFilter || !isJig(txns[i], o.vout))
  }
}

// ------------------------------------------------------------------------------------------------
// Parameter validation
// ------------------------------------------------------------------------------------------------

function parseSplits (splits) {
  switch (typeof splits) {
    case 'number':
      if (!Number.isInteger(splits)) throw new Error(`splits must be an integer: ${splits}`)
      if (splits <= 0) throw new Error(`splits must be at least 1: ${splits}`)
      return splits
    case 'undefined':
      // The mempool chain limit to used by 25, but now it is 1000. When it was 25, the
      // default splits was 10. This was because with 10 splits to choose from, this creates
      // a binomial distribution where we would expect not to hit the limit 98.7% of the
      // time after 120 transactions. This would support one transaction every 5 seconds on
      // average. However, with the ancestor limit raised to 1000, we have no need anymore.
      return 1
    default: throw new Error(`Invalid splits: ${splits}`)
  }
}

// ------------------------------------------------------------------------------------------------

function parseFeePerKb (feePerKb) {
  switch (typeof feePerKb) {
    case 'number':
      if (!Number.isFinite(feePerKb)) throw new Error(`feePerKb must be finite: ${feePerKb}`)
      if (feePerKb < 0) throw new Error(`feePerKb must be non-negative: ${feePerKb}`)
      return feePerKb
    case 'undefined':
      // Current safe fees are 0.5 sat per byte, even though many miners are accepting 0.25
      return Transaction.FEE_PER_KB
    default: throw new Error(`Invalid feePerKb: ${feePerKb}`)
  }
}

// ------------------------------------------------------------------------------------------------

function parseBlockchain (blockchain) {
  switch (typeof blockchain) {
    case 'undefined': throw new Error('blockchain is required')
    case 'object': if (blockchain && blockchain.network) return blockchain; break
  }
  throw new Error(`Invalid blockchain: ${_text(blockchain)}`)
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

async function payWithUtxos (tx, parents, utxos, blockchain, privateKey, address, feePerKb,
  splits, jigFilter) {
  const DUST = Transaction.DUST_AMOUNT

  // Set fees to our custom fee level
  tx.feePerKb(feePerKb)
  const _feeFactor = feePerKb / 1000.0

  // Populate previous outputs
  parents.forEach((parent, n) => {
    if (!parent) return

    tx.inputs[n].output = new Transaction.Output({
      satoshis: parent.satoshis,
      script: new Script(parent.script)
    })
  })

  // Populate placeholder unlock scripts
  const indices = []
  tx.inputs.forEach((input, n) => {
    if (!input.script.toBuffer().length) {
      indices.push(n)
      input.setScript(bsv.deps.Buffer.alloc(DEFAULT_UNLOCK_SCRIPT_SIZE))
    }
  })

  // If there are no outputs, add one change output to ourselves
  const minChangeAmount = tx.outputs.length === 0 ? DUST : 0

  // Get starting input and output amounts
  const inputAmountBefore = tx._getInputAmount()
  const outputAmountBefore = tx._getOutputAmount()

  // Check if we need to pay for anything. Sometimes, there's backed jigs.
  if (inputAmountBefore - outputAmountBefore - minChangeAmount >= tx.toBuffer().length * _feeFactor) {
    if (Log._debugOn) Log._debug(TAG, 'Transaction already paid for. Skipping.')

    // Collect change if leftover after fees is bigger than the tx fee + P2PKH_OUTPUT_SIZE
    const fee = Math.ceil((P2PKH_OUTPUT_SIZE + tx.toBuffer().length) * _feeFactor)
    if (inputAmountBefore - outputAmountBefore > DUST + fee) {
      tx._fee = fee // Fee estimation is not right inside change
      tx.change(address)
    }

    indices.forEach(n => tx.inputs[n].setScript(''))
    return tx
  }

  // Shuffle the UTXOs so that when we start to add them, we don't always start in
  // the same order. This often reduces mempool chain limit errors.
  function shuffle (a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  utxos = shuffle(utxos)

  // We check UTXOs after we check if we need to even pay anything
  if (!utxos.length) {
    const suggestion = `Hint: Have you funded the purse address ${address}?`
    throw new Error(`Not enough funds\n\n${suggestion}`)
  }

  // Track how many inputs existed before, so we know which ones to sign
  const numInputsBefore = tx.inputs.length

  // Calculate fee required
  let feeRequired = tx.toBuffer().length * _feeFactor

  // The satoshisRequired is an amount that is updated for each UTXO added that
  // estimates an upper bound on the amount of satoshis we have left to add. As soon
  // as this goes to zero or negative, we are done.
  let satoshisRequired = feeRequired + outputAmountBefore - inputAmountBefore

  // The number of UTXOs we've added as inputs. This reduces our splits.
  let numUtxosSpent = 0

  // The number of outputs we will create after adding all UTXOs.
  // We always need at least one change output
  let numOutputsToCreate = 1
  feeRequired += P2PKH_OUTPUT_SIZE * _feeFactor
  satoshisRequired += P2PKH_OUTPUT_SIZE * _feeFactor
  satoshisRequired += DUST // There is a minimum dust required in each output

  // Walk through each UTXO and stop when we have enough
  for (const utxo of utxos) {
    // Check that our UTXO is not a jig output
    const prevTx = await blockchain.fetch(utxo.txid)
    if (jigFilter && isJig(prevTx, utxo.vout)) continue

    // Note: As soon as we call tx.from(), the placeholder signatures are cleared,
    // and tx._estimateFee() is no longer accurate.
    tx.from(utxo)
    satoshisRequired -= utxo.satoshis
    numUtxosSpent++
    feeRequired += P2PKH_INPUT_SIZE * _feeFactor
    satoshisRequired += P2PKH_INPUT_SIZE * _feeFactor

    const numOutputsToAdd = splits - utxos.length + numUtxosSpent - numOutputsToCreate
    for (let i = 0; i < numOutputsToAdd; i++) {
      feeRequired += P2PKH_OUTPUT_SIZE * _feeFactor
      satoshisRequired += P2PKH_OUTPUT_SIZE * _feeFactor
      satoshisRequired += DUST // There is a minimum dust required in each output
      numOutputsToCreate++
    }

    // As soon as we have enough satoshis, we're done. We can add the real outputs.
    if (satoshisRequired < 0) break
  }
  feeRequired = Math.ceil(feeRequired)
  satoshisRequired = Math.ceil(satoshisRequired)

  // Check that we didn't run out of UTXOs
  if (satoshisRequired > 0) {
    const info = `Required ${satoshisRequired} more satoshis`
    throw new Error(`Not enough funds\n\n${info}`)
  }

  // Calculate how much satoshis we have to distribute among out change and split outputs
  // We subtract DUST for each output, because that dust was added as a minimum above, and
  // isn't the real amount that goes into each output.
  const satoshisLeftover = -satoshisRequired + numOutputsToCreate * DUST
  const satoshisPerOutput = Math.max(DUST, Math.floor(satoshisLeftover / numOutputsToCreate))
  for (let i = 0; i < numOutputsToCreate; i++) {
    if (i === numOutputsToCreate - 1) {
      tx._fee = feeRequired
      tx.change(address)
    } else {
      tx.to(address, satoshisPerOutput)
    }
  }

  // Sign the new inputs
  for (let i = numInputsBefore; i < tx.inputs.length; i++) {
    const prevout = tx.inputs[i].output
    const sig = await _signature(tx, i, prevout.script, prevout.satoshis, privateKey)
    const pubkey = privateKey.publicKey.toString()
    const script = Script.fromASM(`${sig} ${pubkey}`)
    tx.inputs[i].setScript(script)
  }

  // Log what we paid
  const spent = tx._getInputAmount() - inputAmountBefore
  const received = tx._getOutputAmount() - outputAmountBefore
  const paid = spent - received
  if (Log._debugOn) Log._debug(TAG, 'Paid about', paid, 'satoshis')

  indices.forEach(n => tx.inputs[n].setScript(''))
  return tx
}

// ------------------------------------------------------------------------------------------------

function isJig (rawtx, vout) {
  try {
    const Run = require('../run')
    const metadata = Run.util.metadata(rawtx)
    return vout > metadata.vrun && vout < metadata.out.length + metadata.vrun + 1
  } catch (e) {
    return false
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = LocalPurse
