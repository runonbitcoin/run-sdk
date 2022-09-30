/**
 * indexeddb-cache.js
 *
 * Tests for lib/plugins/indexeddb-cache.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
require('chai').use(require('chai-as-promised'))
const unmangle = require('../env/unmangle')
const { BROWSER } = require('../env/config')
const Run = require('../env/run')
const { IndexedDbCache, CacheWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// IndexedDbCache
// ------------------------------------------------------------------------------------------------

describe('IndexedDbCache', () => {
  // --------------------------------------------------------------------------
  // non-browser
  // --------------------------------------------------------------------------

  // Tests when running in node where IndexedDbCache is not supported
  if (!BROWSER) {
    describe('non-browser', () => {
      it('null if not a browser', () => {
        expect(IndexedDbCache).to.equal(null)
      })
    })

    return // Don't run any other tests
  }

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is CacheWrapper', () => {
      expect(new IndexedDbCache() instanceof CacheWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('opens database', async () => {
      const cache = new IndexedDbCache()
      const key = Math.random().toString()
      expect(await cache.get(key)).to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade required', async () => {
      const dbName = Math.random().toString()
      const cache1 = new IndexedDbCache({ dbName, dbVersion: 1 })
      const db1 = await (unmangle(cache1)._dbPromise)
      db1.close()
      const cache2 = new IndexedDbCache({ dbName, dbVersion: 2 })
      const key = Math.random().toString()
      await expect(cache2.get(key)).to.be.rejectedWith('Upgrade not supported')
    })

    // ------------------------------------------------------------------------

    it('throws if different versions open', async () => {
      const dbName = Math.random().toString()
      const cache1 = new IndexedDbCache({ dbName, dbVersion: 1 }) // eslint-disable-line
      const cache2 = new IndexedDbCache({ dbName, dbVersion: 2 })
      const key = Math.random().toString()
      await expect(cache2.get(key)).to.be.rejectedWith('Upgrade not supported')
    })

    // ------------------------------------------------------------------------

    it('opens twice', async () => {
      const cache1 = new IndexedDbCache()
      const cache2 = new IndexedDbCache()
      const key = Math.random().toString()
      expect(await cache1.get(key)).to.equal(undefined)
      expect(await cache2.get(key)).to.equal(undefined)
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('returns cached value if it exists', async () => {
      const cache = new IndexedDbCache()
      const key = Math.random().toString()
      await cache.set(key, { def: 1 })
      expect(await cache.get(key)).to.deep.equal({ def: 1 })
    })

    // ------------------------------------------------------------------------

    it('returns undefined if it does not exist', async () => {
      const cache = new IndexedDbCache()
      const key = Math.random().toString()
      expect(await cache.get(key)).to.equal(undefined)
    })
  })

  // --------------------------------------------------------------------------
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('sets json', async () => {
      const cache = new IndexedDbCache()
      const json = { s: '', n: 0, b: true, obj: {}, arr: [1, 2, 3] }
      const key = Math.random().toString()
      await cache.set(key, json)
      expect(await cache.get(key)).to.deep.equal(json)
    })
  })
})

// ------------------------------------------------------------------------------------------------
