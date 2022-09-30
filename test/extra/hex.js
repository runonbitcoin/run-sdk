/**
 * hex.js
 *
 * Tests for lib/extra/hex.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Hex } = Run.extra

// ------------------------------------------------------------------------------------------------
// Hex
// ------------------------------------------------------------------------------------------------

describe('Hex', () => {
  // --------------------------------------------------------------------------
  // stringToBytes
  // --------------------------------------------------------------------------

  describe('stringToBytes', () => {
    it('empty', () => {
      expect(Hex.stringToBytes('')).to.deep.equal([])
    })

    // --------------------------------------------------------------------------

    it('lower case', () => {
      expect(Hex.stringToBytes('00')).to.deep.equal([0])
      expect(Hex.stringToBytes('01')).to.deep.equal([1])
      expect(Hex.stringToBytes('ff')).to.deep.equal([255])
      expect(Hex.stringToBytes('ff00')).to.deep.equal([255, 0])
    })

    // --------------------------------------------------------------------------

    it('upper case', () => {
      expect(Hex.stringToBytes('FF')).to.deep.equal([255])
    })

    // --------------------------------------------------------------------------

    it('throws if invalid length', () => {
      expect(() => Hex.stringToBytes('F')).to.throw('Bad hex')
      expect(() => Hex.stringToBytes('000')).to.throw('Bad hex')
    })

    // --------------------------------------------------------------------------

    it('throws if invalid chars', () => {
      expect(() => Hex.stringToBytes('@@')).to.throw('Bad hex')
      expect(() => Hex.stringToBytes('..')).to.throw('Bad hex')
      expect(() => Hex.stringToBytes('  ')).to.throw('Bad hex')
    })
  })

  // --------------------------------------------------------------------------
  // bytesToString
  // --------------------------------------------------------------------------

  describe('bytesToString', () => {
    it('empty array', () => {
      expect(Hex.bytesToString([])).to.equal('')
    })

    // --------------------------------------------------------------------------

    it('valid hex', () => {
      expect(Hex.bytesToString([0, 1, 127, 128, 255])).to.equal('00017f80ff')
    })

    // --------------------------------------------------------------------------

    it('throws if not an array', () => {
      expect(() => Hex.bytesToString()).to.throw('Bad bytes')
      expect(() => Hex.bytesToString({})).to.throw('Bad bytes')
      expect(() => Hex.bytesToString(true)).to.throw('Bad bytes')
    })

    // --------------------------------------------------------------------------

    it('throws if invalid digit', () => {
      expect(() => Hex.bytesToString([[]])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([false])).to.throw('Bad digit')
      expect(() => Hex.bytesToString(['1'])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([-1])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([Infinity])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([NaN])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([1.5])).to.throw('Bad digit')
      expect(() => Hex.bytesToString([256])).to.throw('Bad digit')
    })
  })
})

// ------------------------------------------------------------------------------------------------
