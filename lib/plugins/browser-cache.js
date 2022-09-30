/**
 * browser-cache.js
 *
 * A cache that stores both in local memory and in IndexedDB
 */

/* global VARIANT */

if (typeof VARIANT !== 'undefined' && VARIANT === 'browser') {
  const CacheWrapper = require('./cache-wrapper')
  const LocalCache = require('./local-cache')
  const IndexedDbCache = require('./indexeddb-cache')

  // ----------------------------------------------------------------------------------------------
  // BrowserCache
  // ----------------------------------------------------------------------------------------------

  class BrowserCache extends CacheWrapper {
    constructor (options = { }) {
      super()

      this.localCache = new LocalCache({
        maxSizeMB: options.maxMemorySizeMB
      })

      this.indexedDbCache = new IndexedDbCache({
        dbName: options.dbName,
        dbStore: options.dbStore,
        dbVersion: options.dbVersion
      })

      this.localCache.setWrappingEnabled(false)
      this.indexedDbCache.setWrappingEnabled(false)
    }

    get maxMemorySizeMB () { return this.localCache.maxSizeMB }
    set maxMemorySizeMB (value) { this.localCache.maxSizeMB = value }

    async get (key) {
      const localValue = await this.localCache.get(key)
      if (typeof localValue !== 'undefined') return localValue

      const indexedDbValue = await this.indexedDbCache.get(key)
      if (typeof indexedDbValue !== 'undefined') {
        await this.localCache.set(key, indexedDbValue)
        return indexedDbValue
      }
    }

    async set (key, value) {
      return Promise.all([
        this.localCache.set(key, value),
        this.indexedDbCache.set(key, value)
      ])
    }
  }

  // ----------------------------------------------------------------------------------------------

  module.exports = BrowserCache
} else {
  module.exports = null
}
