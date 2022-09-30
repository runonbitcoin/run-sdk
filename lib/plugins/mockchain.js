/**
 * mockchain.js
 *
 * In-memory Blockchain implementation
 */

const bsv = require('bsv')
const { Address, Script, Transaction } = bsv
const Log = require('../kernel/log')
const { _scripthash } = require('../kernel/bsv')
const { _limit } = require('../kernel/misc')
const { sha256 } = bsv.crypto.Hash
const BlockchainWrapper = require('./blockchain-wrapper')

// ------------------------------------------------------------------------------------------------
// Mockchain
// ------------------------------------------------------------------------------------------------

const TAG = 'Mockchain'

/**
 * An in-memory blockchain implementation.
 *
 * It simulates the mempool and blocks, keeps a UTXO index, checks the mempool chain limit, and
 * generally attempts to create errors that are similar to a real network node or service.
 */
class Mockchain extends BlockchainWrapper {
  constructor () {
    super()

    this.network = 'mock'
    this.mempoolChainLimit = 1000

    this._transactions = new Map() // txid -> rawtx
    this._times = new Map() // txid -> time
    this._spends = new Map() // location -> txid

    this._utxos = new Map() // location -> utxo
    this._ulocations = new Map() // scripthash -> Set<location>

    this._mempool = new Map() // txid -> chainlen
  }

  // --------------------------------------------------------------------------

  async broadcast (rawtx) {
    // Allow both raw transactions and bsv transactions
    const tx = new Transaction(rawtx)
    const txid = tx.hash

    // If we already have this transaction, return silently with a warning
    if (this._transactions.has(txid)) {
      if (Log._warnOn) Log._warn(TAG, 'Already have transaction', txid)
      return txid
    }

    // Process the inputs
    tx.inputs.forEach((input, vin) => {
      const prevtxid = input.prevTxId.toString('hex')
      const location = `${prevtxid}_o${input.outputIndex}`

      // Check that this this input is a UTXO
      const utxo = this._utxos.get(location)
      if (!utxo) {
        const spendtxid = this._spends.get(location)
        const spentInMempool = this._mempool.has(spendtxid)
        throw new Error(spentInMempool ? 'txn-mempool-conflict' : 'Missing inputs')
      }

      // Add the known UTXO
      input.output = new Transaction.Output(utxo)
    })

    // Basic transaction checks on top of BlockchainWrapper
    const satoshisIn = tx.inputs.reduce((prev, curr) => prev + curr.output.satoshis, 0)
    const satoshisOut = tx.outputs.reduce((prev, curr) => prev + curr.satoshis, 0)
    if (satoshisIn < satoshisOut) throw new Error('bad-txns-in-belowout')
    if (tx.getFee() < tx.toBuffer().length * Transaction.FEE_PER_KB / 1000) throw new Error('insufficient priority')

    // Check signatures
    if (tx.isFullySigned() !== true) throw new Error('mandatory-script-verify-flag-failed')
    for (let i = 0; i < tx.inputs.length; i++) {
      if (!tx.isValidSignature({ inputIndex: i })) {
        throw new Error('mandatory-script-verify-flag-failed')
      }
    }

    // Check that the mempool chain length is less than the mempool chain limit
    const chainlen = tx.inputs
      .map(input => input.prevTxId.toString('hex'))
      .map(txid => this._mempool.get(txid) + 1)
      .reduce((max, next) => Math.max(max, next), 0)

    if (chainlen > _limit(this.mempoolChainLimit, 'mempoolChainLimit')) {
      const suggestion = 'Hint: Use run.blockchain.block() to produce blocks on the mockchain.'
      throw new Error(`too-long-mempool-chain\n\n${suggestion}`)
    }

    // Add the transaction to the mockchain
    this._transactions.set(txid, rawtx)
    this._times.set(txid, Date.now())
    this._mempool.set(txid, chainlen)

    // Remove spent outputs
    tx.inputs.forEach((input, vin) => {
      const prevtxid = input.prevTxId.toString('hex')
      const location = `${prevtxid}_o${input.outputIndex}`

      const prevrawtx = this._transactions.get(prevtxid)
      const prevtx = new bsv.Transaction(prevrawtx)
      const prevout = prevtx.outputs[input.outputIndex]
      const prevscripthash = sha256(prevout.script.toBuffer()).reverse().toString('hex')

      this._utxos.delete(location)
      this._ulocations.get(prevscripthash).delete(location)
      this._spends.set(location, txid)
    })

    // Add unspent outputs
    tx.outputs.forEach((output, vout) => {
      const location = `${txid}_o${vout}`
      this._spends.set(location, null)

      const utxo = { txid, vout, script: output.script.toHex(), satoshis: output.satoshis }
      this._utxos.set(location, utxo)

      const scripthash = sha256(output.script.toBuffer()).reverse().toString('hex')
      const ulocations = this._ulocations.get(scripthash) || new Set()
      ulocations.add(location)
      this._ulocations.set(scripthash, ulocations)
    })

    return txid
  }

  // --------------------------------------------------------------------------

  async fetch (txid) {
    const rawtx = this._transactions.get(txid)
    if (!rawtx) throw new Error(`No such mempool or blockchain transaction: ${txid}`)
    return rawtx
  }

  // --------------------------------------------------------------------------

  async utxos (script) {
    const scripthash = await _scripthash(script)
    const ulocations = this._ulocations.get(scripthash)
    if (!ulocations) return []
    return Array.from(ulocations).map(location => this._utxos.get(location))
  }

  // --------------------------------------------------------------------------

  async spends (txid, vout) {
    const location = `${txid}_o${vout}`
    const spend = this._spends.get(location)
    return spend || null
  }

  // --------------------------------------------------------------------------

  async time (txid) {
    const time = this._times.get(txid)
    if (!time) throw new Error(`No such mempool or blockchain transaction: ${txid}`)
    return time
  }

  // --------------------------------------------------------------------------

  /**
   * Directly provides satoshis to an address
   *
   * @param {string} address Address string
   * @param {number} satoshis Amount of satoshis
   * @returns {string} Transaction hash
   */
  fund (address, satoshis) {
    if (Log._infoOn) Log._info(TAG, 'Fund', address.toString(), 'with', satoshis)

    // Create a unique tx
    const random = Math.random().toString()
    const tx = new Transaction()
      .addData(random)
      .to(new Address(address, 'testnet'), satoshis)
    const txid = tx.hash
    const rawtx = tx.toString('hex')

    // Index the tx
    this._transactions.set(txid, rawtx)
    this._times.set(txid, Date.now())
    this._mempool.set(txid, 0)

    // Create the utxo
    const utxo = {
      txid,
      vout: 1,
      script: tx.outputs[1].script.toHex(),
      satoshis: tx.outputs[1].satoshis
    }

    // Index the utxo
    const location = `${txid}_o1`
    this._utxos.set(location, utxo)

    // Index the ulocation
    const script = Script.fromAddress(address)
    const scripthash = sha256(script.toBuffer()).reverse().toString('hex')
    const ulocations = this._ulocations.get(scripthash) || new Set()
    ulocations.add(location)
    this._ulocations.set(scripthash, ulocations)

    return txid
  }

  // --------------------------------------------------------------------------

  block () {
    if (Log._debugOn) Log._debug(TAG, 'Block')

    this._mempool.clear()
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Mockchain
