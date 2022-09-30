/**
 * rules.js
 *
 * Tests for lib/kernel/rules.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const Rules = unmangle(unmangle(Run)._Rules)
const Membrane = unmangle(Run)._Membrane
const { mangle } = unmangle

// ------------------------------------------------------------------------------------------------
// Rules
// ------------------------------------------------------------------------------------------------

describe('Rules', () => {
  describe('jig code', () => {
    it('creates rules', () => {
      const rules = unmangle(Rules._jigCode())
      expect(rules._creation).to.equal(undefined)
      expect(rules._admin).to.equal(true)
      expect(rules._locationBindings).to.equal(true)
      expect(rules._utxoBindings).to.equal(true)
      expect(rules._reserved).to.equal(true)
      expect(rules._codeProps).to.equal(true)
      expect(rules._jigProps).to.equal(false)
      expect(rules._berryProps).to.equal(false)
      expect(rules._privacy).to.equal(true)
      expect(rules._immutable).to.equal(false)
      expect(rules._recordReads).to.equal(true)
      expect(rules._recordUpdates).to.equal(true)
      expect(rules._recordCalls).to.equal(true)
      expect(rules._recordableTarget).to.equal(true)
      expect(rules._smartAPI).to.equal(true)
      expect(rules._thisless).to.equal(false)
      expect(rules._disabledMethods).to.deep.equal([])
    })
  })

  // --------------------------------------------------------------------------

  describe('sidekick code', () => {
    it('creates rules', () => {
      const isClass = Math.random() < 0.5
      const rules = unmangle(Rules._sidekickCode(isClass))
      expect(rules._creation).to.equal(undefined)
      expect(rules._admin).to.equal(true)
      expect(rules._locationBindings).to.equal(true)
      expect(rules._utxoBindings).to.equal(true)
      expect(rules._reserved).to.equal(true)
      expect(rules._codeProps).to.equal(true)
      expect(rules._jigProps).to.equal(false)
      expect(rules._berryProps).to.equal(false)
      expect(rules._privacy).to.equal(false)
      expect(rules._immutable).to.equal(true)
      expect(rules._recordReads).to.equal(true)
      expect(rules._recordUpdates).to.equal(false)
      expect(rules._recordCalls).to.equal(false)
      expect(rules._recordableTarget).to.equal(false)
      expect(rules._smartAPI).to.equal(false)
      expect(rules._thisless).to.equal(!isClass)
      expect(rules._disabledMethods).to.deep.equal([])
    })
  })

  // --------------------------------------------------------------------------

  describe('native code', () => {
    it('creates rules', () => {
      const rules = unmangle(Rules._nativeCode())
      expect(rules._creation).to.equal(undefined)
      expect(rules._admin).to.equal(true)
      expect(rules._locationBindings).to.equal(true)
      expect(rules._utxoBindings).to.equal(true)
      expect(rules._reserved).to.equal(false)
      expect(rules._codeProps).to.equal(true)
      expect(rules._jigProps).to.equal(false)
      expect(rules._berryProps).to.equal(false)
      expect(rules._privacy).to.equal(false)
      expect(rules._immutable).to.equal(true)
      expect(rules._recordReads).to.equal(false)
      expect(rules._recordUpdates).to.equal(false)
      expect(rules._recordCalls).to.equal(false)
      expect(rules._recordableTarget).to.equal(false)
      expect(rules._smartAPI).to.equal(true)
      expect(rules._thisless).to.equal(false)
      expect(rules._disabledMethods).to.deep.equal([])
    })
  })

  // --------------------------------------------------------------------------

  describe('jig object', () => {
    it('creates rules', () => {
      const initialized = Math.random() < 0.5
      const rules = unmangle(Rules._jigObject(initialized))
      expect(rules._creation).to.equal(undefined)
      expect(rules._admin).to.equal(true)
      expect(rules._locationBindings).to.equal(true)
      expect(rules._utxoBindings).to.equal(true)
      expect(rules._reserved).to.equal(true)
      expect(rules._codeProps).to.equal(false)
      expect(rules._jigProps).to.equal(true)
      expect(rules._berryProps).to.equal(false)
      expect(rules._privacy).to.equal(true)
      expect(rules._immutable).to.equal(false)
      expect(rules._recordReads).to.equal(true)
      expect(rules._recordUpdates).to.equal(true)
      expect(rules._recordCalls).to.equal(true)
      expect(rules._recordableTarget).to.equal(true)
      expect(rules._smartAPI).to.equal(true)
      expect(rules._thisless).to.equal(false)
      if (initialized) {
        expect(rules._disabledMethods).to.deep.equal(['init'])
      } else {
        expect(rules._disabledMethods).to.deep.equal([])
      }
    })
  })

  // --------------------------------------------------------------------------

  describe('berry object', () => {
    it('creates rules', () => {
      const initialized = Math.random() < 0.5
      const rules = unmangle(Rules._berryObject(initialized))
      expect(rules._creation).to.equal(undefined)
      expect(rules._admin).to.equal(true)
      expect(rules._locationBindings).to.equal(true)
      expect(rules._utxoBindings).to.equal(true)
      expect(rules._reserved).to.equal(true)
      expect(rules._codeProps).to.equal(false)
      expect(rules._jigProps).to.equal(false)
      expect(rules._berryProps).to.equal(true)
      expect(rules._privacy).to.equal(false)
      expect(rules._immutable).to.equal(true)
      expect(rules._recordReads).to.equal(true)
      expect(rules._recordUpdates).to.equal(false)
      expect(rules._recordCalls).to.equal(false)
      expect(rules._recordableTarget).to.equal(false)
      expect(rules._smartAPI).to.equal(false)
      expect(rules._thisless).to.equal(false)
      if (initialized) {
        expect(rules._disabledMethods).to.deep.equal(['init'])
      } else {
        expect(rules._disabledMethods).to.deep.equal([])
      }
    })
  })

  // --------------------------------------------------------------------------

  describe('child property', () => {
    it('creates rules', () => {
      const parentRules = {
        _admin: Math.random() < 0.5,
        _locationBindings: Math.random() < 0.5,
        _utxoBindings: Math.random() < 0.5,
        _reserved: Math.random() < 0.5,
        _codeProps: Math.random() < 0.5,
        _jigProps: Math.random() < 0.5,
        _berryProps: Math.random() < 0.5,
        _privacy: Math.random() < 0.5,
        _immutable: Math.random() < 0.5,
        _recordReads: Math.random() < 0.5,
        _recordUpdates: Math.random() < 0.5,
        _recordCalls: Math.random() < 0.5,
        _recordableTarget: Math.random() < 0.5,
        _smartAPI: Math.random() < 0.5
      }
      const creation = new Membrane({}, mangle(Object.assign({}, parentRules)))
      const method = false
      const rules = unmangle(Rules._childProperty(creation, method))
      expect(rules._creation).to.equal(creation)
      expect(rules._admin).to.equal(parentRules._admin)
      expect(rules._locationBindings).to.equal(false)
      expect(rules._utxoBindings).to.equal(false)
      expect(rules._reserved).to.equal(false)
      expect(rules._codeProps).to.equal(false)
      expect(rules._jigProps).to.equal(false)
      expect(rules._berryProps).to.equal(false)
      expect(rules._privacy).to.equal(parentRules._privacy)
      expect(rules._immutable).to.equal(parentRules._immutable)
      expect(rules._recordReads).to.equal(parentRules._recordReads)
      expect(rules._recordUpdates).to.equal(parentRules._recordUpdates)
      expect(rules._recordCalls).to.equal(parentRules._recordCalls)
      expect(rules._recordableTarget).to.equal(false)
      expect(rules._smartAPI).to.equal(parentRules._smartAPI)
      expect(rules._thisless).to.equal(parentRules._thisless)
      expect(rules._disabledMethods).to.deep.equal([])
    })

    it('method are immutable', () => {
      const creation = new Membrane({})
      const rules = unmangle(Rules._childProperty(creation, true))
      expect(rules._immutable).to.equal(true)
    })
  })
})
