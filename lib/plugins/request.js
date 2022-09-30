/**
 * request.js
 *
 * Lightweight API to make REST requests in node and the browser
 */

/* global VARIANT */

const Log = require('../kernel/log')
const { TimeoutError } = require('../kernel/error')
const { _limit } = require('../kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Request'

// Cache of string->[Promise] for deduping http requests
const REQUESTS = {}

// Cache of response values and their expiration time
const RESPONSES = {}

// ------------------------------------------------------------------------------------------------
// RequestError
// ------------------------------------------------------------------------------------------------

/**
 * Error when a network request does not return 200
 */
class RequestError extends Error {
  constructor (reason, status, statusText, method, url) {
    super(`${status} ${statusText}\n\n${method} ${url}\n\n${reason}`)
    this.reason = reason
    this.status = status
    this.statusText = statusText
    this.method = method
    this.url = url
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// request
// ------------------------------------------------------------------------------------------------

/**
 * Makes an HTTP request
 * @param {string} url URL to access
 * @param {?object} options Configuration object
 * @param {?string} options.method HTTP method
 * @param {?object} options.body JSON body
 * @param {?object} options.headers Custom request headers in key-value
 * @param {?number} options.timeout Timeout in milliseconds
 * @param {?number} options.retries Number of time to retry
 * @param {?boolean} options.dedup Whether to dedup this request with other GET requests
 * @param {?number} options.cache How long to cache this GET response for
 * @param {?function} options.response Response handler that processes raw responses
 * @returns {*} JSON object or string response
 */
async function request (url, options = {}) {
  options = Object.assign({}, request.defaults, options)

  const id = `${options.method} ${url}`

  // Performs a request once
  async function singleRequest () {
    if (Log._infoOn) Log._info(TAG, id)

    let result = null
    try {
      result = await requestInternal(url, options.method, options.body, options.timeout, options.headers)
    } catch (e) {
      // Add the url to the request error
      e.message += `\n\n${options.method} ${url}`
      throw e
    }

    // Parse the result
    const { data, status, statusText } = result

    // Success
    if (status >= 200 && status < 300) return data

    // Error. Report it.
    const message = data && data.message ? (data.message.message || data.message) : data
    const reason = data && data.name && message ? `${data.name}: ${message}` : (data && data.name) || message
    throw new RequestError(reason, status, statusText, options.method, url)
  }

  const dedup = options.method === 'GET' && options.dedup ? _dedup : (cache, id, f) => f()
  const cache = options.method === 'GET' && !!options.cache ? _cache : (cache, id, ms, f) => f()
  const response = async f => options.response ? options.response(await f()) : await f()

  return await dedup(REQUESTS, id, async () => {
    return await cache(RESPONSES, id, options.cache, async () => {
      return await response(async () => {
        return await _retry(options.retries, id, async () => {
          return await singleRequest()
        })
      })
    })
  })
}

// ------------------------------------------------------------------------------------------------
// Internal request function
// ------------------------------------------------------------------------------------------------

/**
 * Makes an HTTP request.
 *
 * This is set differently for browser or node
 * @param {string} url Url to request
 * @param {string} method GET or POST
 * @param {?object} body Optional body for POST methods
 * @param {number} timeout Timeout in milliseconds
 * @param {object} headers Custom HTTP headers
 * @returns {Promise<{data, status, statusText}>} Response data, status code, and status message
 */
let requestInternal = null

// ------------------------------------------------------------------------------------------------
// Browser request function
// ------------------------------------------------------------------------------------------------

if (typeof VARIANT !== 'undefined' && VARIANT === 'browser') {
  requestInternal = async function (url, method, body, timeout, headers) {
    const { AbortController, fetch } = window

    // Make a copy of the headers, because we will change it
    headers = Object.assign({}, headers)

    const controller = new AbortController()
    headers.accept = 'application/json'

    const assumeJson = body && !headers['content-type']
    if (assumeJson) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(body)
    }

    const options = { method, body: body, headers, signal: controller.signal }
    let timedOut = false
    const timerId = setTimeout(() => { timedOut = true; controller.abort() }, _limit(timeout, 'timeout'))

    try {
      const res = await fetch(url, options)

      let data = null
      const contentTypeHeaders = res.headers.get('content-type')
      if (contentTypeHeaders && contentTypeHeaders.includes('application/json')) {
        data = await res.json()
      } else if (contentTypeHeaders && contentTypeHeaders.includes('application/octet-stream')) {
        data = await res.arrayBuffer()
        data = Buffer.from(data)
      } else {
        data = await res.text()
      }

      return { data, status: res.status, statusText: res.statusText }
    } catch (e) {
      if (timedOut) throw new TimeoutError(`Request timed out after ${timeout}ms`)
      throw e
    } finally {
      clearTimeout(timerId)
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Node request function
// ------------------------------------------------------------------------------------------------

if (typeof VARIANT === 'undefined' || VARIANT === 'node') {
  requestInternal = async function (url, method, body, timeout, headers) {
    return new Promise((resolve, reject) => {
      const https = url.startsWith('http://') ? require('http') : require('https')
      const zlib = require('zlib')

      // Make a copy of the headers, because we will change it
      headers = Object.assign({}, headers)

      headers.accept = 'application/json'
      headers['accept-encoding'] = 'gzip'

      const assumeJson = body && !headers['content-type']
      if (assumeJson) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(body)
      }

      const options = { method, headers, timeout: _limit(timeout, 'timeout') }

      function onData (res, data) {
        const contentTypeHeaders = res.headers['content-type']
        if (contentTypeHeaders && contentTypeHeaders.includes('application/json') && data) {
          try {
            data = JSON.parse(data)
          } catch (e) { data = undefined }
        } else if (contentTypeHeaders && contentTypeHeaders.includes('application/octet-stream')) {
          // Leave data as buffer
        } else {
          data = data.toString()
        }
        resolve({ data, status: res.statusCode, statusText: res.statusMessage })
      }

      function onResponse (res) {
        let data = Buffer.alloc(0)
        res.on('data', part => { data = Buffer.concat([data, part]) })

        res.on('end', () => {
          if (res.headers['content-encoding'] === 'gzip') {
            zlib.gunzip(data, function (err, unzipped) {
              if (err) return reject(err)
              onData(res, unzipped.toString())
            })
          } else {
            onData(res, data)
          }
        })
      }

      const req = https.request(url, options, onResponse)
      if (body) req.write(body)

      req.on('error', e => reject(e))

      req.on('timeout', () => {
        req.abort()
        reject(new TimeoutError(`Request timed out after ${timeout}ms`))
      })

      req.end()
    })
  }
}

// ------------------------------------------------------------------------------------------------
// _retry
// ------------------------------------------------------------------------------------------------

/**
 *
 * @param {number} retries
 * @param {string} id String that uniquely identifies this request
 * @param {function} f Async function to perform
 * @returns {*} Result of the async function
 */
async function _retry (retries, id, f) {
  // Retries a single request
  for (let i = 0; i <= retries; i++) {
    try {
      return await f()
    } catch (e) {
      if (i === retries) throw e
      if (Log._warnOn) Log._warn(e.toString())
      if (Log._infoOn) Log._info(TAG, id, `(Retry ${i + 1}/${retries})`)
    }
  }
}

// ------------------------------------------------------------------------------------------------
// _dedup
// ------------------------------------------------------------------------------------------------

/**
 * Dedups async tasks that return the same value
 * @param {object} cache Cache to store duplicate task
 * @param {string} id String that uniquely identifies this request
 * @param {function} f Async function to perform
 * @returns {*} Result of the async function
 */
async function _dedup (cache, id, f) {
  const prev = cache[id]

  if (prev) {
    return new Promise((resolve, reject) => prev.push({ resolve, reject }))
  }

  const promises = cache[id] = []

  try {
    const result = await f()

    promises.forEach(x => x.resolve(result))

    return result
  } catch (e) {
    promises.forEach(x => x.reject(e))

    throw e
  } finally {
    delete cache[id]
  }
}

// ------------------------------------------------------------------------------------------------
// _cache
// ------------------------------------------------------------------------------------------------

/**
 * Caches the result or error of an async task for a period of time
 * @param {object} cache Cache to store results
 * @param {string} id String that uniquely identifies this task
 * @param {number} ms Milliseconds to cache the result
 * @param {function} f Async function to perform the task
 * @returns {*} Result of the async function
 */
async function _cache (cache, id, ms, f) {
  const now = Date.now()
  for (const cachedKey of Object.keys(cache)) {
    if (now > cache[cachedKey].expires) {
      delete cache[cachedKey]
    }
  }

  const prev = cache[id]
  if (prev && now < prev.expires) {
    if (prev.error) throw prev.error
    return prev.result
  }

  if (!ms) return await f()

  try {
    const result = await f()
    cache[id] = { expires: now + ms, result }
    return result
  } catch (error) {
    cache[id] = { expires: now + ms, error }
    throw error
  }
}

// ------------------------------------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------------------------------------

request.defaults = {}
request.defaults.method = 'GET'
request.defaults.body = undefined
request.defaults.headers = {}
request.defaults.timeout = 30000
request.defaults.retries = 2
request.defaults.dedup = true
request.defaults.cache = 0

// ------------------------------------------------------------------------------------------------

request._RequestError = RequestError
request._retry = _retry
request._dedup = _dedup
request._cache = _cache

module.exports = request
