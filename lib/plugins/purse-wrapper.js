/**
 * purse-wrapper.js
 *
 * Wraps a Run Purse implementation to add common functionality:
 *
 *    - Logging calls
 *    - Logging performance
 *    - Validate responses
 *    - Allows paying without passing parents
 *    - send() method to make a payment
 *
 * To use, either wrap an owner instance:
 *
 *    new PurseWrapper(myPurse)
 *
 * or extend your class from it:
 *
 *    class MyPurse extends PurseWrapper { ... }
 */

const bsv = require('bsv')
const Log = require('../kernel/log')
const { _text } = require('../kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const HEX_REGEX = /^(?:[a-fA-F0-9][a-fA-F0-9])*$/

// ------------------------------------------------------------------------------------------------
// PurseWrapper
// ------------------------------------------------------------------------------------------------

class PurseWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (purse = this, blockchain = null) {
    this.tag = purse.constructor.name === 'Object' ? 'Purse' : purse.constructor.name

    this.blockchain = blockchain

    this.unwrappedPurse = purse
    this.unwrappedPay = purse.pay
    this.unwrappedBroadcast = purse.broadcast
    this.unwrappedCancel = purse.cancel

    this.setWrappingEnabled(true)
  }

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  setWrappingEnabled (enabled) {
    if (enabled) {
      this.pay = PurseWrapper.prototype.wrappedPay
      this.broadcast = this.unwrappedBroadcast && PurseWrapper.prototype.wrappedBroadcast
      this.cancel = this.unwrappedCancel && PurseWrapper.prototype.wrappedCancel
    } else {
      this.pay = this.unwrappedPay
      this.broadcast = this.unwrappedBroadcast
      this.cancel = this.unwrappedCancel
    }
  }

  // ------------------------------------------------------------------------
  // wrappedPay
  // ------------------------------------------------------------------------

  async wrappedPay (rawtx, parents) {
    // Allow both raw transactions and bsv transactions
    if (rawtx instanceof bsv.Transaction) rawtx = rawtx.toString()

    // Check that rawtx is a valid hex string
    const throwBadTx = () => { throw new Error(`Invalid tx to pay: ${_text(rawtx)}`) }
    if (typeof rawtx !== 'string' || !HEX_REGEX.test(rawtx)) throwBadTx()
    try { new bsv.Transaction(rawtx) } catch (e) { throwBadTx() } // eslint-disable-line

    // Allow parents to be null when user is calling
    if (typeof parents === 'undefined') parents = []

    // Validate parents
    const badParents =
      !Array.isArray(parents) ||
      parents.some(x => typeof x.script !== 'string') ||
      parents.some(x => typeof x.satoshis !== 'number')
    if (badParents) throw new Error(`Invalid parents: ${_text(parents)}`)

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Pay')
    const start = new Date()
    const paidtx = await this.unwrappedPay.call(this.unwrappedPurse, rawtx, parents)
    if (Log._debugOn) Log._debug(this.tag, 'Pay (end): ' + (new Date() - start) + 'ms')

    // Check that paidtx is valid
    if (typeof paidtx !== 'string' || !HEX_REGEX.test(paidtx)) throw new Error(`Invalid paid tx: ${paidtx}`)

    return paidtx
  }

  // ------------------------------------------------------------------------
  // wrappedBroadcast
  // ------------------------------------------------------------------------

  async wrappedBroadcast (rawtx) {
    // Check that rawtx is a valid hex string
    const throwBadTx = () => { throw new Error(`Invalid tx to broadcast: ${_text(rawtx)}`) }
    if (typeof rawtx !== 'string' || !HEX_REGEX.test(rawtx)) throwBadTx()
    try { new bsv.Transaction(rawtx) } catch (e) { throwBadTx() } // eslint-disable-line

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Broadcast')
    const start = new Date()
    const ret = await this.unwrappedBroadcast.call(this.unwrappedPurse, rawtx)
    if (Log._debugOn) Log._debug(this.tag, 'Broadcast (end): ' + (new Date() - start) + 'ms')

    return ret
  }

  // ------------------------------------------------------------------------
  // wrappedCancel
  // ------------------------------------------------------------------------

  async wrappedCancel (rawtx) {
    // Check that rawtx is a valid hex string
    const throwBadTx = () => { throw new Error(`Invalid tx to cancel: ${_text(rawtx)}`) }
    if (typeof rawtx !== 'string' || !HEX_REGEX.test(rawtx)) throwBadTx()
    try { new bsv.Transaction(rawtx) } catch (e) { throwBadTx() } // eslint-disable-line

    // Call the API
    if (Log._infoOn) Log._info(this.tag, 'Cancel')
    const start = new Date()
    const ret = await this.unwrappedCancel.call(this.unwrappedPurse, rawtx)
    if (Log._debugOn) Log._debug(this.tag, 'Cancel (end): ' + (new Date() - start) + 'ms')

    return ret
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = PurseWrapper
