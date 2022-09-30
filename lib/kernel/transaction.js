/**
 * transaction.js
 *
 * Transaction API for building transactions manually
 */

const bsv = require('bsv')
const Record = require('./record')
const _replay = require('./replay')
const Log = require('./log')
const { _assert, _text, _Timeout, _activeKernel } = require('./misc')
const { _extractMetadata } = require('./metadata')
const { ArgumentError } = require('./error')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Transaction'

// ------------------------------------------------------------------------------------------------
// Transaction
// ------------------------------------------------------------------------------------------------

class Transaction {
  constructor () {
    this._record = new Record()
    this._record._replaying = false
    this._record._autopublish = false
    this._base = new bsv.Transaction()

    this._commit = null // Replayed or built commit
    this._tx = null // Replayed or built tx
    this._txid = null

    this._buildPromise = null
    this._payPromise = null
    this._signPromise = null
    this._exportPromise = null
    this._publishPromise = null
    this._cachePromise = null

    this._published = false // Record whether published to prevent further updates
    this._cached = false // Record whether cached to prevent further updates
  }

  // --------------------------------------------------------------------------
  // setters
  // --------------------------------------------------------------------------

  set base (rawtx) {
    const tx = new bsv.Transaction(rawtx)
    if (tx.inputs.length) {
      throw new Error('Only custom outputs are supported in base transactions')
    }
    this._base = tx
  }

  // --------------------------------------------------------------------------
  // getters
  // --------------------------------------------------------------------------

  get base () {
    return this._base.toString('hex')
  }

  // --------------------------------------------------------------------------

  get outputs () {
    return [...this._record._outputs]
  }

  // --------------------------------------------------------------------------

  get deletes () {
    return [...this._record._deletes]
  }

  // --------------------------------------------------------------------------
  // update
  // --------------------------------------------------------------------------

  update (callback) {
    if (typeof callback !== 'function') throw new ArgumentError('Invalid callback')

    if (Log._infoOn) Log._info(TAG, 'Update')

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('update disabled during atomic update')
    if (this._exportPromise) throw new Error('update disabled during export')
    if (this._publishPromise) throw new Error('update disabled during publish')
    if (this._payPromise) throw new Error('update disabled during pay')
    if (this._signPromise) throw new Error('update disabled during sign')
    if (this._buildPromise) throw new Error('update disabled during build')
    if (this._cachePromise) throw new Error('update disabled during cache')
    if (this._published) throw new Error('update disabled once published')
    if (this._cached) throw new Error('update disabled once cached')

    // Any updates clear the saved commit
    this._commit = null
    this._tx = null
    this._txid = null

    const savedRecord = Record._CURRENT_RECORD

    try {
      // Replace the current record with ours
      Record._CURRENT_RECORD = this._record

      // Begin recording
      Record._CURRENT_RECORD._begin()

      // Perform updates atomically
      let ret = null
      try {
        Transaction._ATOMICALLY_UPDATING = true
        ret = callback()
      } finally {
        Transaction._ATOMICALLY_UPDATING = false
      }

      // Async updates are not allowed because we require atomicity
      if (ret instanceof Promise) throw new Error('async transactions not supported')

      // Stop recording
      Record._CURRENT_RECORD._end()

      // Return the return value of the callback
      return ret
    } catch (e) {
      // When an error occurs, all changes are reverted
      this.rollback()

      // Rethrow
      throw e
    } finally {
      Record._CURRENT_RECORD = savedRecord
    }
  }

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  pay () {
    if (Transaction._ATOMICALLY_UPDATING) throw new Error('pay disabled during atomic update')
    if (this._signPromise) throw new Error('pay disabled during sign')
    if (this._exportPromise) throw new Error('pay disabled during export')
    if (this._publishPromise) throw new Error('pay disabled during publish')
    if (this._payPromise) return this._payPromise
    if (this._buildPromise) throw new Error('pay disabled during build')
    if (this._cachePromise) throw new Error('pay disabled during cache')
    if (this._published) throw new Error('pay disabled once published')
    if (this._cached) throw new Error('pay disabled once cached')

    const kernel = _activeKernel()
    const timeout = new _Timeout('pay', kernel._timeout)

    const payAsync = async () => {
      const { _PURSE_SAFETY_QUEUE, _payForTx } = require('./publish')
      await _PURSE_SAFETY_QUEUE._enqueue(async () => {
        const feePerKb = bsv.Transaction.FEE_PER_KB
        this._tx = await _payForTx(this._tx, this._commit, feePerKb)
        this._txid = null
        timeout._check()
      })
    }

    this._payPromise = this._build(timeout, false).then(() => payAsync())

    this._payPromise
      .then(() => { this._payPromise = null })
      .catch(e => { this._payPromise = null; throw e })

    return this._payPromise
  }

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  sign () {
    if (Transaction._ATOMICALLY_UPDATING) throw new Error('sign disabled during atomic update')
    if (this._payPromise) throw new Error('sign disabled during pay')
    if (this._exportPromise) throw new Error('sign disabled during export')
    if (this._publishPromise) throw new Error('sign disabled during publish')
    if (this._signPromise) return this._signPromise
    if (this._buildPromise) throw new Error('sign disabled during build')
    if (this._cachePromise) throw new Error('sign disabled during cache')
    if (this._published) throw new Error('sign disabled once published')
    if (this._cached) throw new Error('sign disabled once cached')

    const kernel = _activeKernel()
    const timeout = new _Timeout('sign', kernel._timeout)

    const signAsync = async () => {
      const { _PURSE_SAFETY_QUEUE, _signTx } = require('./publish')
      await _PURSE_SAFETY_QUEUE._enqueue(async () => {
        const feePerKb = bsv.Transaction.FEE_PER_KB
        this._tx = await _signTx(this._tx, this._commit, feePerKb)
        this._txid = null
        timeout._check()
      })
    }

    this._signPromise = this._build(timeout, false).then(() => signAsync())

    this._signPromise
      .then(() => { this._signPromise = null })
      .catch(e => { this._signPromise = null; throw e })

    return this._signPromise
  }

  // --------------------------------------------------------------------------
  // cache
  // --------------------------------------------------------------------------

  cache () {
    if (Log._infoOn) Log._info(TAG, 'Cache')

    const start = new Date()

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('cache disabled during atomic update')
    if (this._payPromise) throw new Error('cache disabled during pay')
    if (this._signPromise) throw new Error('cache disabled during sign')
    if (this._exportPromise) throw new Error('cache disabled during export')
    if (this._publishPromise) throw new Error('cache disabled during publish')
    if (this._buildPromise) throw new Error('cache disabled during build')
    if (this._cachePromise) return this._cachePromise
    if (this._cached) return true

    const kernel = _activeKernel()
    const timeout = new _Timeout('cache', kernel._timeout)

    const cacheAsync = async () => {
      const { _cacheStates, _finalizeLocationsAndOrigins } = require('./publish')

      // Add to cache, both outputs and deleted states
      this._txid = this._txid || this._tx.hash
      await _cacheStates(this._commit, this._commit._states, this._txid)
      timeout._check()

      // Apply bindings to output and deleted jigs and their after snapshots
      _finalizeLocationsAndOrigins(this._commit, this._txid)
    }

    this._cachePromise = this._build(timeout, false)
      .then(() => cacheAsync())

    const logEnd = () => { if (Log._debugOn) Log._debug(TAG, 'Cache (end): ' + (new Date() - start) + 'ms') }

    // Wait for publish to finish
    this._cachePromise
      .then(() => { logEnd(); this._cached = true; this._cachePromise = null })
      .catch(e => { this._cachePromise = null; throw e })

    return this._cachePromise
  }

  // --------------------------------------------------------------------------
  // publish
  // --------------------------------------------------------------------------

  publish (options = { }) {
    if (Log._infoOn) Log._info(TAG, 'Publish')

    const start = new Date()

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('publish disabled during atomic update')
    if (this._payPromise) throw new Error('publish disabled during pay')
    if (this._signPromise) throw new Error('publish disabled during sign')
    if (this._exportPromise) throw new Error('publish disabled during export')
    if (this._publishPromise) return this._publishPromise
    if (this._published) return true
    if (this._buildPromise) throw new Error('publish disabled during build')
    if (this._cachePromise) throw new Error('publish disabled during cache')

    if (typeof options.pay !== 'undefined' && typeof options.pay !== 'boolean') {
      throw new ArgumentError(`Invalid pay: ${_text(options.pay)}`)
    }

    if (typeof options.sign !== 'undefined' && typeof options.sign !== 'boolean') {
      throw new ArgumentError(`Invalid sign: ${_text(options.sign)}`)
    }

    const pay = typeof options.pay === 'undefined' ? true : options.pay
    const sign = typeof options.sign === 'undefined' ? true : options.sign

    if (this._cached && pay) throw new Error('pay disabled once cached')
    if (this._cached && sign) throw new Error('sign disabled once cached')

    const kernel = _activeKernel()
    const timeout = new _Timeout('publish', kernel._timeout)

    this._publishPromise = this._build(timeout, true)
      .then(() => this._finishAndPublish(pay, sign, timeout))

    const logEnd = () => { if (Log._debugOn) Log._debug(TAG, 'Publish (end): ' + (new Date() - start) + 'ms') }

    // Wait for publish to finish
    this._publishPromise = this._publishPromise
      .then(() => { logEnd(); this._published = true; this._publishPromise = null })
      .catch(e => { this._publishPromise = null; throw e })

    // Return the txid
    this._publishPromise = this._publishPromise.then(() => this._txid)

    return this._publishPromise
  }

  // --------------------------------------------------------------------------
  // export
  // --------------------------------------------------------------------------

  export (options = {}) {
    if (Log._infoOn) Log._info(TAG, 'Export')

    const start = new Date()

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('export disabled during atomic update')
    if (this._payPromise) throw new Error('export disabled during pay')
    if (this._signPromise) throw new Error('export disabled during sign')
    if (this._publishPromise) throw new Error('export disabled during publish')
    if (this._cachePromise) throw new Error('export disabled during cache')
    if (this._exportPromise) return this._exportPromise

    if (typeof options.pay !== 'undefined' && typeof options.pay !== 'boolean') {
      throw new ArgumentError(`Invalid pay: ${_text(options.pay)}`)
    }

    if (typeof options.sign !== 'undefined' && typeof options.sign !== 'boolean') {
      throw new ArgumentError(`Invalid sign: ${_text(options.sign)}`)
    }

    const pay = typeof options.pay === 'undefined' ? true : options.pay
    const sign = typeof options.sign === 'undefined' ? true : options.sign

    if (this._cached && pay) throw new Error('pay disabled once cached')
    if (this._cached && sign) throw new Error('sign disabled once cached')
    if (this._published && pay) throw new Error('pay disabled once published')
    if (this._published && sign) throw new Error('sign disabled once published')

    const kernel = _activeKernel()
    const timeout = new _Timeout('export', kernel._timeout)

    this._exportPromise = this._build(timeout, false)
      .then(() => this._finishAndExport(pay, sign, timeout))

    const logEnd = () => { if (Log._debugOn) Log._debug(TAG, 'Export (end): ' + (new Date() - start) + 'ms') }

    this._exportPromise
      .then(rawtx => { logEnd(); this._exportPromise = null; return rawtx })
      .catch(e => { this._exportPromise = null; throw e })

    return this._exportPromise
  }

  // --------------------------------------------------------------------------
  // rollback
  // --------------------------------------------------------------------------

  rollback () {
    if (Log._infoOn) Log._info(TAG, 'Rollback')

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('rollback disabled during atomic update')

    // Cannot rollback in the middle of publishing or exporting
    if (this._exportPromise) throw new Error('rollback disabled during export')
    if (this._publishPromise) throw new Error('rollback disabled during publish')
    if (this._payPromise) throw new Error('rollback disabled during pay')
    if (this._signPromise) throw new Error('rollback disabled during sign')
    if (this._buildPromise) throw new Error('rollback disabled during build')
    if (this._cachePromise) throw new Error('rollback disabled during cache')
    if (this._published) throw new Error('rollback disabled once published')

    // Roll back the record which rolls back all states
    this._record._rollback()
    this._record = new Record()
    this._record._replaying = false
    this._record._autopublish = false
  }

  // --------------------------------------------------------------------------
  // import
  // --------------------------------------------------------------------------

  static async _import (tx, txid, kernel) {
    if (Log._infoOn) Log._info(TAG, 'Replay')

    const metadata = _extractMetadata(tx)
    const published = false
    const jigToSync = null
    const timeout = undefined
    const preverify = false
    const commit = await _replay(tx, txid, metadata, kernel, published, jigToSync, timeout, preverify)

    const transaction = new Transaction()
    transaction._record = commit._record
    transaction._commit = commit
    transaction._tx = tx
    transaction._txid = txid
    return transaction
  }

  // --------------------------------------------------------------------------
  // _build
  // --------------------------------------------------------------------------

  _build (timeout, publishing) {
    // Only build once
    if (this._commit && this._tx) {
      if (publishing) this._commit._setPublishing(true)
      return Promise.resolve()
    }
    _assert(!this._commit && !this._tx)

    // If already building, piggy-back on that
    if (this._buildPromise) return this._buildPromise

    // Convert the record into a commit
    const commit = this._record._commit()

    // If no commit, then nothing to export
    if (!commit) throw new Error('Nothing to commit')

    // Set the base transaction
    commit._base = this._base

    // If we need this commit activated (in run.transaction), do it now
    if (publishing) commit._setPublishing(true)

    this._buildPromise = this._buildAsync(commit, timeout)

    this._buildPromise
      .then(rawtx => { this._buildPromise = null; return rawtx })
      .catch(e => { this._buildPromise = null; throw e })

    return this._buildPromise
  }

  // --------------------------------------------------------------------------

  async _buildAsync (commit, timeout) {
    try {
      // Wait for upstream dependencies to publish
      await commit._onReady()

      const record = commit._record

      // There must be no upstream dependencies
      _assert(!record._upstream.length)

      const {
        _checkNoTimeTravel,
        _assignInitialOwners,
        _generateOutputScripts,
        _finalizeOwnersAndSatoshis,
        _createMasterList,
        _captureStates,
        _hashStates,
        _createExec,
        _createMetadata,
        _createPartialTx,
        _preverify
      } = require('./publish')

      // Assigns initial owners in the jigs after snapshots
      await _assignInitialOwners(commit)
      timeout._check()

      // Generate the output scripts
      const outputScripts = await _generateOutputScripts(commit)
      timeout._check()

      // Make sure references do not go back in time
      await _checkNoTimeTravel(commit, timeout)
      timeout._check()

      // Make owners and satoshis bound properties
      _finalizeOwnersAndSatoshis(commit)

      // Create the sorted master list used to serialize actions
      const masterList = _createMasterList(record)

      // Calculate the serialized states of output and deleted jigs
      const states = await _captureStates(commit, timeout)
      timeout._check()

      // Calculate state hashes
      const hashes = await _hashStates(commit, states)

      // Convert the actions to executable statements
      const exec = _createExec(record, masterList)

      // Create the OP_RETURN metadata json
      const metadata = _createMetadata(commit, hashes, exec, masterList)

      // Create the unpaid and unsigned tx
      const feePerKb = bsv.Transaction.FEE_PER_KB
      const partialtx = _createPartialTx(commit, metadata, outputScripts, feePerKb)

      // Preverify the transaction we generated so we have some assurance it will load.
      // This is a safety check for Run bugs. It is not intended to catch consensus failures.
      await _preverify(commit._kernel, record, states, metadata, partialtx, timeout)
      timeout._check()

      // Save the built tx
      this._commit = commit
      this._tx = partialtx
      this._txid = null
    } catch (e) {
      if (commit._publishing()) commit._onPublishFail(e)
      throw e
    }
  }

  // --------------------------------------------------------------------------
  // _finishAndPublish
  // --------------------------------------------------------------------------

  /**
   * Pays and signs for an existing transaction before publishing it
   */
  async _finishAndPublish (pay, sign, timeout) {
    const {
      _captureStates,
      _PURSE_SAFETY_QUEUE,
      _payForTx,
      _cancelPaidTx,
      _signTx,
      _checkTx,
      _broadcastTx,
      _finalizeLocationsAndOrigins,
      _cacheStates
    } = require('./publish')

    if (!this._commit._publishing()) this._commit._setPublishing(true)

    try {
      const record = this._commit._record

      // Calculate the serialized states of output and deleted jigs
      const states = await _captureStates(this._commit, timeout)
      timeout._check()

      this._txid = await _PURSE_SAFETY_QUEUE._enqueue(async () => {
        const partialtx = this._tx
        const feePerKb = bsv.Transaction.FEE_PER_KB

        // Add inputs and outputs to pay for the transaction
        const paidtx = pay ? await _payForTx(partialtx, this._commit, feePerKb) : partialtx
        timeout._check()

        let signedtx = null

        try {
          // Sign the jig owners
          signedtx = sign ? await _signTx(paidtx, this._commit, feePerKb) : paidtx
          timeout._check()

          // Check that all signatures are present. This provides a nicer error.
          _checkTx(signedtx, record, partialtx)
        } catch (e) {
          try {
            await _cancelPaidTx(paidtx, this._commit._kernel._purse)
          } catch (e) {
            if (Log._errorOn) Log._error(TAG, e)
          }
          throw e
        }

        // Broadcast the rawtx to the blockchain
        let txid = null
        try {
          txid = await _broadcastTx(this._commit, signedtx, timeout)
        } catch (e) {
          try {
            await _cancelPaidTx(paidtx, this._commit._kernel._purse)
          } catch (e) {
            if (Log._errorOn) Log._error(TAG, e)
          }
          throw e
        }

        const badTxid = typeof txid !== 'string' || txid.length !== 64
        if (badTxid) throw new Error(`Invalid txid: ${_text(txid)}`)

        timeout._check()

        // Return the paid and signed transaction
        return txid
      })
      timeout._check()

      // Apply bindings to output and deleted jigs and their after snapshots
      _finalizeLocationsAndOrigins(this._commit, this._txid)

      // Add to cache, both outputs and deleted states
      await _cacheStates(this._commit, states, this._txid)
      timeout._check()

      // Add this txid to the trusted set if there were any deploys or upgrades
      const anythingToTrust =
        record._actions.some(action => action.op() === 'DEPLOY') ||
        record._actions.some(action => action.op() === 'UPGRADE')

      if (anythingToTrust) {
        this._commit._kernel._trustlist.add(this._txid)
      }

      this._commit._onPublishSucceed()
    } catch (e) {
      this._commit._onPublishFail(e)
      throw e
    }
  }

  // --------------------------------------------------------------------------
  // _finishAndExport
  // --------------------------------------------------------------------------

  /**
   * Signs and pays for an already-existing transaction before exporting
   */
  async _finishAndExport (pay, sign, timeout) {
    const {
      _PURSE_SAFETY_QUEUE,
      _payForTx,
      _cancelPaidTx,
      _signTx
    } = require('./publish')

    // Serialize from pay to broadcast because the purse may consume outputs that should not be
    // consumed again in another parallel publish, but the purse may not mark them as spent right
    // away. In the future we might consider making this serialization optional for smarter purses.
    const tx = await _PURSE_SAFETY_QUEUE._enqueue(async () => {
      const partialTx = this._tx
      const feePerKb = bsv.Transaction.FEE_PER_KB

      // Add inputs and outputs to pay for the transaction
      const paidtx = pay ? await _payForTx(partialTx, this._commit, feePerKb) : partialTx
      timeout._check()

      let signedtx = null

      try {
        // Sign the jig owners
        signedtx = sign ? await _signTx(paidtx, this._commit, feePerKb) : paidtx
        timeout._check()
      } catch (e) {
        try {
          await _cancelPaidTx(paidtx, this._commit._kernel._purse)
        } catch (e) {
          if (Log._errorOn) Log._error(TAG, e)
        }
        throw e
      }

      // Return the paid and signed transaction
      return signedtx
    })
    timeout._check()

    return tx.toString('hex')
  }
}

// ------------------------------------------------------------------------------------------------

// Variable indicating whether we are in an update() and should not allow changes to Run
Transaction._ATOMICALLY_UPDATING = false

module.exports = Transaction
