/**
 * state-filter.js
 *
 * Tests for lib/plugins/state-filter.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const unmangle = require('../env/unmangle')
const Run = require('../env/run')
const StateFilter = unmangle(Run)._StateFilter

// ------------------------------------------------------------------------------------------------
// StateFilter
// ------------------------------------------------------------------------------------------------

describe('StateFilter', () => {
  // --------------------------------------------------------------------------
  // create
  // --------------------------------------------------------------------------

  describe('create', () => {
    it('default', () => {
      const filter = StateFilter.create()
      expect(filter.buckets.length).to.equal(960)
      expect(filter.buckets.some(x => x !== 0)).to.equal(false)
      expect(filter.numHashes).to.equal(7)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid size', () => {
      expect(() => StateFilter.create(0)).to.throw('invalid size: 0')
      expect(() => StateFilter.create(-1)).to.throw('invalid size: -1')
      expect(() => StateFilter.create(8.5)).to.throw('invalid size: 8.5')
      expect(() => StateFilter.create(Infinity)).to.throw('invalid size: Infinity')
      expect(() => StateFilter.create(NaN)).to.throw('invalid size: NaN')
      expect(() => StateFilter.create(null)).to.throw('invalid size: null')
      expect(() => StateFilter.create('8')).to.throw('invalid size: 8')
    })

    // ------------------------------------------------------------------------

    it('throws if size is not a multiple of 8', () => {
      expect(() => StateFilter.create(1)).to.throw('size must be a multiple of 8: 1')
      expect(() => StateFilter.create(7)).to.throw('size must be a multiple of 8: 7')
      expect(() => StateFilter.create(25)).to.throw('size must be a multiple of 8: 25')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid numHashes', () => {
      expect(() => StateFilter.create(8, 0)).to.throw('invalid numHashes: 0')
      expect(() => StateFilter.create(8, -1)).to.throw('invalid numHashes: -1')
      expect(() => StateFilter.create(8, 8.5)).to.throw('invalid numHashes: 8.5')
      expect(() => StateFilter.create(8, Infinity)).to.throw('invalid numHashes: Infinity')
      expect(() => StateFilter.create(8, NaN)).to.throw('invalid numHashes: NaN')
      expect(() => StateFilter.create(8, null)).to.throw('invalid numHashes: null')
      expect(() => StateFilter.create(8, '8')).to.throw('invalid numHashes: 8')
    })
  })

  // --------------------------------------------------------------------------
  // add
  // --------------------------------------------------------------------------

  describe('add', () => {
    it('add string keys', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '')
      StateFilter.add(filter, '1')
      StateFilter.add(filter, 'abc')
      let long = '0123456789'
      for (let i = 0; i < 10; i++) long = long + long
      StateFilter.add(filter, long)
      StateFilter.add(filter, 'jig://a9bcb91166a726aa65d21f8dc76a2e25b3efc7aa21f98624edb4cfcb29df529d_o1')
    })

    // ------------------------------------------------------------------------

    it('throws if not a string key', () => {
      const filter = StateFilter.create()
      expect(() => StateFilter.add(filter)).to.throw('invalid key: ')
      expect(() => StateFilter.add(filter, null)).to.throw('invalid key: null')
      expect(() => StateFilter.add(filter, 1)).to.throw('invalid key: 1')
      expect(() => StateFilter.add(filter, true)).to.throw('invalid key: true')
      expect(() => StateFilter.add(filter, {})).to.throw('invalid key: [object Object]')
    })

    // ------------------------------------------------------------------------

    it('does not change if already added', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, 'abc')
      const buckets = Array.from(filter.buckets)
      StateFilter.add(filter, 'abc')
      expect(filter.buckets).to.deep.equal(buckets)
    })
  })

  // --------------------------------------------------------------------------
  // remove
  // --------------------------------------------------------------------------

  describe('remove', () => {
    it('removes added keys', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      StateFilter.add(filter, '456')
      expect(filter.buckets.some(x => x !== 0)).to.equal(true)
      expect(StateFilter.remove(filter, '123')).to.equal(true)
      expect(StateFilter.remove(filter, '456')).to.equal(true)
      expect(filter.buckets.some(x => x !== 0)).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('does not remove missing keys', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      expect(StateFilter.remove(filter, '123')).to.equal(true)
      expect(StateFilter.remove(filter, '123')).to.equal(false)
      expect(StateFilter.remove(filter, '456')).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('throws if not a string key', () => {
      const filter = StateFilter.create()
      expect(() => StateFilter.remove(filter)).to.throw('invalid key: ')
      expect(() => StateFilter.remove(filter, null)).to.throw('invalid key: null')
      expect(() => StateFilter.remove(filter, 1)).to.throw('invalid key: 1')
      expect(() => StateFilter.remove(filter, true)).to.throw('invalid key: true')
      expect(() => StateFilter.remove(filter, {})).to.throw('invalid key: [object Object]')
    })
  })

  // --------------------------------------------------------------------------
  // possiblyHas
  // --------------------------------------------------------------------------

  describe('possiblyHas', () => {
    it('returns true for keys added', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      expect(StateFilter.possiblyHas(filter, '123')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false for keys not added', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      expect(StateFilter.possiblyHas(filter, '456')).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for keys removed', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      StateFilter.remove(filter, '123')
      expect(StateFilter.possiblyHas(filter, '123')).to.equal(false)
    })
  })

  // --------------------------------------------------------------------------
  // toBase64
  // --------------------------------------------------------------------------

  describe('toBase64', () => {
    it('converts', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      StateFilter.add(filter, '456')
      expect(StateFilter.toBase64(filter)).to.equal('BwAIAABAAAAAAAAAAAAAAAAAQAAAAAAAQAAAAACAAAAAAAAAAAQAAQAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAgABAAAAAAAAAAACAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAA==')
    })
  })

  // --------------------------------------------------------------------------
  // fromBase64
  // --------------------------------------------------------------------------

  describe('fromBase64', () => {
    it('converts', () => {
      const filter = StateFilter.create()
      StateFilter.add(filter, '123')
      StateFilter.add(filter, '456')
      const base64 = StateFilter.toBase64(filter)
      const filter2 = StateFilter.fromBase64(base64)
      expect(filter).to.deep.equal(filter2)
      expect(StateFilter.possiblyHas(filter2, '123')).to.equal(true)
      expect(StateFilter.possiblyHas(filter2, '456')).to.equal(true)
      expect(StateFilter.possiblyHas(filter2, '789')).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
