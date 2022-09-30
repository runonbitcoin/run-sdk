/**
 * cache-wrapper.js
 *
 * Tests for lib/plugins/cache-wrapper.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const Run = require('../env/run')
const { CacheWrapper } = Run.plugins
const unmangle = require('../env/unmangle')
const Log = unmangle(unmangle(Run)._Log)

// ------------------------------------------------------------------------------------------------
// CacheWrapper
// ------------------------------------------------------------------------------------------------

describe('CacheWrapper', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('wraps methods when extended', () => {
      class MyCache extends CacheWrapper {
        get () { }
        set () { }
      }
      const wrapper = new MyCache()
      expect(wrapper.get).not.to.equal(MyCache.prototype.get)
      expect(wrapper.set).not.to.equal(MyCache.prototype.set)
    })

    // ------------------------------------------------------------------------

    it('wraps methods when passed in', () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      expect(wrapper.get).not.to.equal(cache.get)
      expect(wrapper.set).not.to.equal(cache.set)
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('wraps call', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      cache.get.returns(456)
      const response = await wrapper.get('123')
      expect(response).to.equal(456)
      expect(cache.get.calledWith('123')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.get('123')
      expect(logger.info.args.some(args => args.join(' ').includes('[Cache] Get 123'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs with class name', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      class MyCache {
        get () {}
        set () {}
      }
      const cache = stub(new MyCache())
      const wrapper = new CacheWrapper(cache)
      await wrapper.get('123')
      expect(logger.info.args.some(args => args.join(' ').includes('[MyCache] Get 123'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.get('123')
      expect(logger.debug.args.some(args => args.join(' ').includes('[Cache] Get (end): '))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs value in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      cache.get.returns(true)
      const wrapper = new CacheWrapper(cache)
      await wrapper.get('123')
      expect(logger.debug.args.some(args => args.join(' ').includes('[Cache] Value: true'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates key is string', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await expect(wrapper.get(null)).to.be.rejectedWith('Invalid key: null')
      await expect(wrapper.get('')).to.be.rejectedWith('Invalid key: ""')
      await expect(wrapper.get([])).to.be.rejectedWith('Invalid key: [object Array]')
      await expect(wrapper.get(true)).to.be.rejectedWith('Invalid key: true')
    })

    // ------------------------------------------------------------------------

    it('validates response is json or undefined', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      cache.get.returns(new Set())
      await expect(wrapper.get('123')).to.be.rejectedWith('Invalid value retrieved for 123')
      cache.get.returns(Infinity)
      await expect(wrapper.get('123')).to.be.rejectedWith('Invalid value retrieved for 123')
      cache.get.returns([Infinity])
      await expect(wrapper.get('123')).to.be.rejectedWith('Invalid value retrieved for 123')
    })
  })

  // --------------------------------------------------------------------------
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('wraps call', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('123', 456)
      expect(cache.set.calledWith('123', 456)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs call', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('123', [])
      expect(logger.info.args.some(args => args.join(' ').includes('[Cache] Set 123'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs performance in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('123', [])
      expect(logger.debug.args.some(args => args.join(' ').includes('[Cache] Set (end): '))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('logs value in debug', async () => {
      const logger = stub({ info: x => x, warn: x => x, error: x => x, debug: x => x })
      Log._logger = logger
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('123', null)
      expect(logger.debug.args.some(args => args.join(' ').includes('[Cache] Value: null'))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('validates key is string', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await expect(wrapper.set(null, true)).to.be.rejectedWith('Invalid key: null')
      await expect(wrapper.set('', true)).to.be.rejectedWith('Invalid key: ""')
      await expect(wrapper.set([], true)).to.be.rejectedWith('Invalid key: [object Array]')
      await expect(wrapper.set(true, true)).to.be.rejectedWith('Invalid key: true')
    })

    // ------------------------------------------------------------------------

    it('validates value is json', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('abc', 'xyz')
      await expect(wrapper.set('abc', Infinity)).to.be.rejectedWith('Cannot cache')
      await expect(wrapper.set('abc', new Error())).to.be.rejectedWith('Cannot cache')
      await expect(wrapper.set('abc', undefined)).to.be.rejectedWith('Cannot cache')
      await expect(wrapper.set('abc', Symbol.hasInstance)).to.be.rejectedWith('Cannot cache')
      await expect(wrapper.set('abc', () => {})).to.be.rejectedWith('Cannot cache')
    })

    // ------------------------------------------------------------------------

    it('enforces immutable keys', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      cache.get.returns(true)
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('abc://xyz', false)
      await expect(wrapper.set('tx://abc', false)).to.be.rejected
      await expect(wrapper.set('jig://abc', false)).to.be.rejected
      await expect(wrapper.set('berry://abc', false)).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('updates code filter', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      await wrapper.set('jig://abc', { kind: 'code' })
      expect(cache.set.args.some(args => args[0] === 'config://code-filter')).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // setWrappingEnabled
  // --------------------------------------------------------------------------

  describe('setWrappingEnabled', () => {
    it('disable', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      wrapper.setWrappingEnabled(false)
      await wrapper.set(null, new Set())
    })

    // ------------------------------------------------------------------------

    it('reenable', async () => {
      const cache = stub({ get: () => {}, set: () => {} })
      const wrapper = new CacheWrapper(cache)
      wrapper.setWrappingEnabled(false)
      wrapper.setWrappingEnabled(true)
      await expect(wrapper.set(null, new Set())).to.be.rejected
    })
  })
})

// ------------------------------------------------------------------------------------------------
