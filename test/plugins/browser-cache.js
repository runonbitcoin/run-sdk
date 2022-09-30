/**
 * browser-cache.js
 *
 * Tests for lib/plugins/browser-cache.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const { spy } = require('sinon')
const unmangle = require('../env/unmangle')
const Run = require('../env/run')
const { BROWSER } = require('../env/config')
const { BrowserCache, LocalCache, IndexedDbCache, CacheWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// BrowserCache
// ------------------------------------------------------------------------------------------------

describe('BrowserCache', () => {
  // --------------------------------------------------------------------------
  // non-browser
  // --------------------------------------------------------------------------

  // Tests when running in node where IndexedDbCache is not supported
  if (!BROWSER) {
    describe('non-browser', () => {
      it('null if not a browser', () => {
        expect(BrowserCache).to.equal(null)
      })
    })

    return // Don't run any other tests
  }

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is CacheWrapper', () => {
      expect(new BrowserCache() instanceof CacheWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('creates internal caches', () => {
      const cache = new BrowserCache()
      expect(cache.localCache instanceof LocalCache).to.equal(true)
      expect(cache.indexedDbCache instanceof IndexedDbCache).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('supports maxMemorySizeMB option', () => {
      const browserCache = new BrowserCache({ maxMemorySizeMB: 123 })
      const localCache = browserCache.localCache
      expect(localCache.maxSizeMB).to.equal(123)
      browserCache.maxMemorySizeMB = 456
      expect(browserCache.maxMemorySizeMB).to.equal(456)
      expect(localCache.maxSizeMB).to.equal(456)
    })

    // ------------------------------------------------------------------------

    it('supports indexeddb cache options', () => {
      const cache = new BrowserCache({ dbName: 'abc', dbVersion: 456, dbStore: 'def' })
      expect(unmangle(cache.indexedDbCache)._name).to.equal('abc')
      expect(unmangle(cache.indexedDbCache)._version).to.equal(456)
      expect(unmangle(cache.indexedDbCache)._store).to.equal('def')
    })
  })

  // --------------------------------------------------------------------------
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('sets in both caches', async () => {
      const cache = new BrowserCache()
      spy(cache.localCache)
      spy(cache.indexedDbCache)
      await cache.set('abc', 123)
      expect(cache.localCache.set.calledWith('abc', 123)).to.equal(true)
      expect(cache.indexedDbCache.set.calledWith('abc', 123)).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('gets from local cache if exists', async () => {
      const cache = new BrowserCache()
      spy(cache.localCache)
      spy(cache.indexedDbCache)
      await cache.set('abc', 123)
      expect(await cache.get('abc')).to.equal(123)
      expect(cache.localCache.get.calledWith('abc')).to.equal(true)
      expect(cache.indexedDbCache.get.called).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('gets from indexed cache if not in memory', async () => {
      const cache = new BrowserCache()
      spy(cache.localCache)
      spy(cache.indexedDbCache)
      await cache.indexedDbCache.set('def', 123)
      expect(await cache.get('def')).to.equal(123)
      expect(cache.localCache.get.called).to.equal(true)
      expect(cache.indexedDbCache.get.called).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns undefined if no cache has value', async () => {
      const cache = new BrowserCache()
      spy(cache.localCache)
      spy(cache.indexedDbCache)
      expect(await cache.get('ghi')).to.equal(undefined)
      expect(cache.localCache.get.called).to.equal(true)
      expect(cache.indexedDbCache.get.called).to.equal(true)
    })
  })
})

// ------------------------------------------------------------------------------------------------
