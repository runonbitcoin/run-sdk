/**
 * node-cache.js
 *
 * Tests for lib/plugins/node-cache.js
 */

const { describe, it, beforeEach, afterEach } = require('mocha')
const { expect } = require('chai')
const { spy } = require('sinon')
const Run = require('../env/run')
const { BROWSER } = require('../env/config')
const { rmrfSync } = require('../env/misc')
const { NodeCache, LocalCache, DiskCache, CacheWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// NodeCache
// ------------------------------------------------------------------------------------------------

describe('NodeCache', () => {
  // Use a temporary directory and clean it up after
  let previousDir = null
  beforeEach(() => { previousDir = DiskCache.defaults.dir; DiskCache.defaults.dir = './.tmp' })
  afterEach(() => { rmrfSync(DiskCache.defaults.dir); DiskCache.defaults.dir = previousDir })

  // --------------------------------------------------------------------------
  // browser
  // --------------------------------------------------------------------------

  // Tests when running in the browser where DiskCache is not supported
  if (BROWSER) {
    describe('browser', () => {
      it('null if browser', () => {
        expect(NodeCache).to.equal(null)
      })
    })

    return // Don't run any other tests
  }

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is CacheWrapper', () => {
      expect(new NodeCache() instanceof CacheWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('creates internal caches', () => {
      const cache = new NodeCache()
      expect(cache.localCache instanceof LocalCache).to.equal(true)
      expect(cache.diskCache instanceof DiskCache).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('supports maxMemorySizeMB option', () => {
      const nodeCache = new NodeCache({ maxMemorySizeMB: 123 })
      const localCache = nodeCache.localCache
      expect(localCache.maxSizeMB).to.equal(123)
      nodeCache.maxMemorySizeMB = 456
      expect(nodeCache.maxMemorySizeMB).to.equal(456)
      expect(localCache.maxSizeMB).to.equal(456)
    })

    // ------------------------------------------------------------------------

    it('supports dir option', () => {
      const cache = new NodeCache({ dir: '.tmp' })
      expect(cache.diskCache.dir).to.equal('.tmp')
    })
  })

  // --------------------------------------------------------------------------
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('sets in both caches', async () => {
      const cache = new NodeCache()
      spy(cache.localCache)
      spy(cache.diskCache)
      await cache.set('abc', 123)
      expect(cache.localCache.set.calledWith('abc', 123)).to.equal(true)
      expect(cache.diskCache.set.calledWith('abc', 123)).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('gets from local cache if exists', async () => {
      const cache = new NodeCache()
      spy(cache.localCache)
      spy(cache.diskCache)
      await cache.set('abc', 123)
      expect(await cache.get('abc')).to.equal(123)
      expect(cache.localCache.get.calledWith('abc')).to.equal(true)
      expect(cache.diskCache.get.called).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('gets from indexed cache if not in memory', async () => {
      const cache = new NodeCache()
      spy(cache.localCache)
      spy(cache.diskCache)
      await cache.diskCache.set('def', 123)
      expect(await cache.get('def')).to.equal(123)
      expect(cache.localCache.get.called).to.equal(true)
      expect(cache.diskCache.get.called).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns undefined if no cache has value', async () => {
      const cache = new NodeCache()
      spy(cache.localCache)
      spy(cache.diskCache)
      expect(await cache.get('ghi')).to.equal(undefined)
      expect(cache.localCache.get.called).to.equal(true)
      expect(cache.diskCache.get.called).to.equal(true)
    })
  })
})

// ------------------------------------------------------------------------------------------------
