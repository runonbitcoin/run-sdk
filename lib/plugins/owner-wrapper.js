/**
 * owner-wrapper.js
 *
 * Wraps a Run Owner implementation to add common functionality:
 *
 *    - Logging calls
 *    - Logging performance
 *    - Validating parameters and responses
 *    - Allowing signing without passing parents or locks
 *
 * To use, either wrap an owner instance:
 *
 *    new OwnerWrapper(myOwner)
 *
 * or extend your class from it:
 *
 *    class MyOwner extends OwnerWrapper { ... }
 */

const Log = require('../kernel/log')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const HEX_REGEX = /^(?:[a-fA-F0-9][a-fA-F0-9])*$/

// ------------------------------------------------------------------------------------------------
// OwnerWrapper
// ------------------------------------------------------------------------------------------------

class OwnerWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (owner = this) {
    this.tag = owner.constructor.name === 'Object' ? 'Owner' : owner.constructor.name

    this.unwrappedOwner = owner
    this.unwrappedNextOwner = owner.nextOwner
    this.unwrappedSign = owner.sign

    this.setWrappingEnabled(true)
  }

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  setWrappingEnabled (enabled) {
    if (enabled) {
      this.nextOwner = OwnerWrapper.prototype.wrappedNextOwner
      this.sign = OwnerWrapper.prototype.wrappedSign
    } else {
      this.nextOwner = this.unwrappedNextOwner
      this.sign = this.unwrappedSign
    }
  }

  // ------------------------------------------------------------------------
  // wrappedNextOwner
  // ------------------------------------------------------------------------

  async wrappedNextOwner () {
    if (Log._infoOn) Log._info(this.tag, 'Next owner')
    const start = new Date()
    const owner = await this.unwrappedNextOwner.call(this.unwrappedOwner)
    if (Log._debugOn) Log._debug(this.tag, 'Next owner (end): ' + (new Date() - start) + 'ms')
    return owner
  }

  // ------------------------------------------------------------------------
  // wrappedSign
  // ------------------------------------------------------------------------

  async wrappedSign (rawtx, parents, locks) {
    // Allow parents and locks to be null when user is calling
    parents = parents || []
    locks = locks || []

    // Check that rawtx is a valid hex string
    if (typeof rawtx !== 'string' || !HEX_REGEX.test(rawtx)) throw new Error(`Invalid tx to sign: ${rawtx}`)

    if (Log._infoOn) Log._info(this.tag, 'Sign')
    const start = new Date()
    const signedtx = await this.unwrappedSign.call(this.unwrappedOwner, rawtx, parents, locks)
    if (Log._debugOn) Log._debug(this.tag, 'Sign (end): ' + (new Date() - start) + 'ms')

    // Check that signedtx is valid
    if (typeof signedtx !== 'string' || !HEX_REGEX.test(signedtx)) throw new Error(`Invalid signed tx: ${signedtx}`)

    return signedtx
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = OwnerWrapper
