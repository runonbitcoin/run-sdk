/**
 * determinism.js
 *
 * Tests for lib/kernel/determinism.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { _deterministicJSONStringify, _deterministicCompareKeys } = unmangle(unmangle(Run)._determinism)

// ------------------------------------------------------------------------------------------------
// Determinism
// ------------------------------------------------------------------------------------------------

describe('Determinism', () => {
  // ---------------------------------------------------------------------------------------------
  // _deterministicJSONStringify
  // ----------------------------------------------------------------------------------------------

  describe('_deterministicJSONStringify', () => {
    it('stringifies', () => {
      expect(_deterministicJSONStringify({ a: [{ b: 2 }, '3'] })).to.equal('{"a":[{"b":2},"3"]}')
    })

    // ------------------------------------------------------------------------

    it('orders keys alphabetically', () => {
      expect(_deterministicJSONStringify({ 3: 3, b: 2, 1: 1 })).to.equal('{"1":1,"3":3,"b":2}')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _deterministicCompareKeys
  // ----------------------------------------------------------------------------------------------

  describe('_deterministicCompareKeys', () => {
    it('sorts strings before symbols', () => {
      const x = [Symbol.iterator, 'b', 'a', 'a', '1', '0', Symbol.hasInstance]
      const y = x.sort(_deterministicCompareKeys)
      expect(y).to.deep.equal(['0', '1', 'a', 'a', 'b', Symbol.hasInstance, Symbol.iterator])
    })

    // ------------------------------------------------------------------------

    it('sorts integer keys before string keys', () => {
      const x = ['b', 'a', '0', '01', '10', '11', '1', '2', '011']
      const y = x.sort(_deterministicCompareKeys)
      expect(y).to.deep.equal(['0', '1', '2', '10', '11', '01', '011', 'a', 'b'])
    })
  })
})

// ------------------------------------------------------------------------------------------------
