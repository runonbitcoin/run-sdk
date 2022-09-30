/**
 * common-lock.js
 *
 * Tests for lib/kernel/common-lock.js
 */

const bsv = require('bsv')
const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { CommonLock } = Run.util

// ------------------------------------------------------------------------------------------------
// CommonLock
// ------------------------------------------------------------------------------------------------

describe('CommonLock', () => {
  // --------------------------------------------------------------------------
  // script
  // --------------------------------------------------------------------------

  describe('script', () => {
    it('valid addresses', () => {
      new CommonLock('14kPnFashu7rYZKTXvJU8gXpJMf9e3f8k1').script() // eslint-disable-line
      new CommonLock('mhZZFmSiUqcmf8wQrBNjPAVHUCFsHso9ni').script() // eslint-disable-line
    })

    // ------------------------------------------------------------------------

    it('throws if bad address', () => {
      expect(() => new CommonLock().script()).to.throw('Address is not a string')
      expect(() => new CommonLock([]).script()).to.throw('Address is not a string')
      expect(() => new CommonLock('3P14159f73E4gFr7JterCCQh9QjiTjiZrG').script()).to.throw('Address may only be a P2PKH type')
      expect(() => new CommonLock('mhZZFmSiUqcmf8wQrBNjPAVHUCFsHso9n').script()).to.throw('Address may only be a P2PKH type')
      expect(() => new CommonLock('@').script()).to.throw('Invalid character in address')
      expect(() => new CommonLock('3P14').script()).to.throw('Address too short: 3P14')
    })

    // ------------------------------------------------------------------------

    it('returns P2PKH script', () => {
      const addr = '14kPnFashu7rYZKTXvJU8gXpJMf9e3f8k1'
      const script = bsv.Script.fromAddress(addr)
      const hex1 = script.toHex()
      const hex2 = new CommonLock(addr).script()
      expect(hex1).to.deep.equal(hex2)
    })
  })

  // --------------------------------------------------------------------------
  // domain
  // --------------------------------------------------------------------------

  describe('domain', () => {
    it('returns P2PKH unlock script max size', () => {
      expect(new CommonLock('14kPnFashu7rYZKTXvJU8gXpJMf9e3f8k1').domain()).to.equal(108)
    })
  })
})

// ------------------------------------------------------------------------------------------------
