/**
 * indexeddb-cache.js
 *
 * A persistent cache for use in the browser
 */

/* global VARIANT */

if (typeof VARIANT !== 'undefined' && VARIANT === 'browser') {
  const CacheWrapper = require('./cache-wrapper')
  const { _browser } = require('../kernel/environment')

  // ----------------------------------------------------------------------------------------------
  // Globals
  // ----------------------------------------------------------------------------------------------

  const DATABASE_NAME = 'run-browser-cache'
  const DATABASE_VERSION = 1
  const DATABASE_STORE = 'run-objects'

  // ----------------------------------------------------------------------------------------------
  // IndexedDbCache
  // ----------------------------------------------------------------------------------------------

  class IndexedDbCache extends CacheWrapper {
    constructor (options = { }) {
      super()

      // Make sure we are running in a browser environment with indexedDB
      if (!_browser() || typeof window.indexedDB === 'undefined') {
        throw new Error('Your browser doesn\'t support IndexedDB')
      }

      // Parse settings
      this._name = typeof options.dbName !== 'undefined' ? options.dbName : DATABASE_NAME
      this._version = typeof options.dbVersion !== 'undefined' ? options.dbVersion : DATABASE_VERSION
      this._store = typeof options.dbStore !== 'undefined' ? options.dbStore : DATABASE_STORE

      // Setup initial cache state
      let dbResolve, dbReject
      this._dbPromise = new Promise((resolve, reject) => { dbResolve = resolve; dbReject = reject })

      // Open the database asyncronously
      const request = window.indexedDB.open(this._name, this._version)
      request.onsuccess = () => dbResolve(request.result)
      request.onerror = () => dbReject(new Error(`Cannot access database: ${request.error.message}`))
      request.onblocked = () => dbReject(new Error('Upgrade not supported'))
      request.onupgradeneeded = event => {
        if (event.oldVersion !== 0) { dbReject(new Error('Upgrade not supported')); return }
        const db = request.result
        db.createObjectStore(this._store)
      }
    }

    async set (key, value) {
    // Open the object store that has all keys
      const db = await this._dbPromise
      const tx = db.transaction(this._store, 'readwrite')
      const objs = tx.objectStore(this._store)

      // Add the value with the key
      return new Promise((resolve, reject) => {
        const request = objs.put(value, key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(request.error)
      })
    }

    async get (key) {
    // Open the object store that has all keys in read-only mode
      const db = await this._dbPromise
      const tx = db.transaction(this._store, 'readonly')
      const objs = tx.objectStore(this._store)

      // Get the value using the key
      return new Promise((resolve, reject) => {
        const request = objs.get(key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(request.error)
      })
    }
  }

  // ----------------------------------------------------------------------------------------------

  module.exports = IndexedDbCache
} else {
  module.exports = null
}
