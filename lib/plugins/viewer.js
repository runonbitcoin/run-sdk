/**
 * viewer.js
 *
 * A Run Owner for loading another person's jigs but being unable to sign them.
 */

const { _text, _bsvNetwork } = require('../kernel/misc')
const { _owner } = require('../kernel/bindings')
const bsv = require('bsv')
const { Script } = bsv
const Log = require('../kernel/log')
const OwnerWrapper = require('./owner-wrapper')

// ------------------------------------------------------------------------------------------------
// Viewer
// ------------------------------------------------------------------------------------------------

const TAG = 'Viewer'

class Viewer extends OwnerWrapper {
  /**
   * Creates a new Viewer
   * @param {string|object} owner Address string, pubkey string, or custom lock
   * @param {?string} network Optional network string
   */
  constructor (owner, network) {
    super()

    this.owner = owner
    this.script = Script.fromHex(_owner(this.owner, false, network && _bsvNetwork(network)).script())
  }

  async sign (rawtx, parents, locks) {
    if (Log._warnOn) Log._warn(TAG, 'Viewer cannot sign ', _text(this.owner))

    return rawtx
  }

  nextOwner () {
    return this.owner
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Viewer
