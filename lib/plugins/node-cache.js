/**
 * node-cache.js
 *
 * Cache that stores state in files on the disk and also has a memory cache
 */

/* global VARIANT */

if (typeof VARIANT === 'undefined' || VARIANT === 'node') {
  const CacheWrapper = require('./cache-wrapper')
  const LocalCache = require('./local-cache')
  const DiskCache = require('./disk-cache')

  // ----------------------------------------------------------------------------------------------
  // NodeCache
  // ----------------------------------------------------------------------------------------------

  class NodeCache extends CacheWrapper {
    constructor (options = {}) {
      super()

      this.localCache = new LocalCache({
        maxSizeMB: options.maxMemorySizeMB
      })

      this.diskCache = new DiskCache({
        dir: options.dir
      })

      this.localCache.setWrappingEnabled(false)
      this.diskCache.setWrappingEnabled(false)
    }

    get maxMemorySizeMB () { return this.localCache.maxSizeMB }
    set maxMemorySizeMB (value) { this.localCache.maxSizeMB = value }

    async get (key) {
      const localValue = await this.localCache.get(key)
      if (typeof localValue !== 'undefined') return localValue

      const diskValue = await this.diskCache.get(key)
      if (typeof diskValue !== 'undefined') {
        await this.localCache.set(key, diskValue)
        return diskValue
      }
    }

    async set (key, value) {
      return Promise.all([
        this.localCache.set(key, value),
        this.diskCache.set(key, value)
      ])
    }
  }

  // ----------------------------------------------------------------------------------------------

  module.exports = NodeCache
} else {
  module.exports = null
}
