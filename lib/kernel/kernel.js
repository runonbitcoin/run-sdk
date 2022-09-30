/**
 * kernel.js
 *
 * Run's core that loads jigs and creates transactions
 */

const bsv = require('bsv')
const { _assert, _bsvNetwork } = require('./misc')
const Editor = require('./editor')
const { _sha256Internal } = require('./bsv')
const { ClientModeError } = require('./error')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const EVENTS = ['load', 'sync', 'publish', 'update']

// ------------------------------------------------------------------------------------------------
// Kernel
// ------------------------------------------------------------------------------------------------

class Kernel {
  constructor () {
    // Blockchain API implementation
    this._blockchain = undefined

    // State API implementation
    this._state = undefined

    // Cache API implementation
    this._cache = undefined

    // Owner API implementation
    this._owner = undefined

    // Purse API implementation
    this._purse = undefined

    // App name string for transactions
    this._app = undefined

    // Event listeners in the form { _event, _listener }
    this._listeners = []

    // Default max satoshis in a backed jig
    this._backingLimit = 100000000

    // Timeout for kernel actions
    this._timeout = 10000

    // Trusted code. Defaults to none. They are txids, and there are two special values, "*" and "cache".
    this._trustlist = new Set()

    // Whether to check that a transaction does not have any locally-detectable verification
    // errors before publishing. This does not check consensus but it may find Run bugs. It will
    // slow down publishing however. We will keep this on until we are 100% confident in Run.
    this._preverify = true

    // Client mode will only load jigs from the cache. This is a setting for browsers and apps to work reliably.
    this._client = false

    // Whether jigs should be rolled back to their last safe state if there is an error
    this._rollbacks = false
  }

  // --------------------------------------------------------------------------

  /**
   * Activates this kernel instance so its owner, blockchain, transaction queue and more are used.
   */
  _activate () {
    if (Kernel._instance === this) return
    if (Kernel._instance) Kernel._instance._deactivate()

    Kernel._instance = this
    bsv.Networks.defaultNetwork = bsv.Networks[_bsvNetwork(this._blockchain.network)]

    Editor._activate()
  }

  // --------------------------------------------------------------------------

  /**
   * Deactivates the current run instance, cleaning up anything in the process
   */
  _deactivate () {
    if (!Kernel._instance) return

    Editor._deactivate()
    Kernel._instance = null
  }

  // --------------------------------------------------------------------------

  _emit (event, data) {
    _assert(EVENTS.includes(event))

    this._listeners
      .filter(x => x._event === event)
      .forEach(x => x._listener(event, data))
  }

  // --------------------------------------------------------------------------

  // The trust list works off TXIDs because locations are not known when the code
  // is about to be executed during replay.
  async _trusted (txid, from) {
    return this._trustlist.has('*') ||
      this._trustlist.has(txid) ||
      (from === 'state' && this._trustlist.has('state')) ||
      await this._state.pull(`trust://${txid}`)
  }

  // --------------------------------------------------------------------------

  async _fetch (txid) {
    const cachedTx = await this._state.pull(`tx://${txid}`)
    if (typeof cachedTx !== 'undefined') return cachedTx

    // In client mode, we must use the cache.
    if (this._client) throw new ClientModeError(txid, 'transaction')

    return await this._blockchain.fetch(txid)
  }

  // --------------------------------------------------------------------------

  async _spends (txid, vout) {
    const cachedSpend = await this._state.pull(`spend://${txid}_o${vout}`)
    if (typeof cachedSpend !== 'undefined') return cachedSpend

    // In client mode, we must use the cache
    if (this._client) return

    return await this._blockchain.spends(txid, vout)
  }

  // --------------------------------------------------------------------------

  async _time (txid) {
    const cachedTime = await this._state.pull(`time://${txid}`)
    if (typeof cachedTime !== 'undefined') return cachedTime

    // In client mode, we must use the cache.
    if (this._client) return

    return await this._blockchain.time(txid)
  }
}

// ------------------------------------------------------------------------------------------------

// No kernel instance is active by default
Kernel._instance = null

// The sha256 function used by the kernel is our internal one
Kernel._sha256 = _sha256Internal

// ------------------------------------------------------------------------------------------------

Kernel._EVENTS = EVENTS

module.exports = Kernel
