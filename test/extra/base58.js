/**
 * base58.js
 *
 * Tests for lib/extra/base58.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Base58, Hex } = Run.extra

// ------------------------------------------------------------------------------------------------
// Base58
// ------------------------------------------------------------------------------------------------

describe('Base58', () => {
  describe('decode', () => {
    it('mainnet address', () => {
      expect(Hex.bytesToString(Base58.decode('14kPnFashu7rYZKTXvJU8gXpJMf9e3f8k1')))
        .to.equal('291d4797c2817f6247481e261a3ccb35c24e38ab')
    })

    // --------------------------------------------------------------------------

    it('testnet address', () => {
      expect(Hex.bytesToString(Base58.decode('mhZZFmSiUqcmf8wQrBNjPAVHUCFsHso9ni')))
        .to.equal('166e44610354f34a927b7bd9a20a2270c9d373fc')
    })

    // --------------------------------------------------------------------------

    it('throws if invalid', () => {
      expect(() => Base58.decode()).to.throw('Cannot decode')
      expect(() => Base58.decode('3P14')).to.throw('Base58 string too short')
      expect(() => Base58.decode('')).to.throw('Base58 string too short')
      expect(() => Base58.decode(null)).to.throw('Cannot decode')
    })
  })
})

// ------------------------------------------------------------------------------------------------
