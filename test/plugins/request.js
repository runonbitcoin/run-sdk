/**
 * request.js
 *
 * Tests for lib/plugins/request.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { stub } = require('sinon')
const Run = require('../env/run')
const { TimeoutError, RequestError } = Run.errors
const unmangle = require('../env/unmangle')
const request = unmangle(Run)._request
const { _retry, _dedup, _cache } = unmangle(request)

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const timeout = 10000

// ------------------------------------------------------------------------------------------------
// request
// ------------------------------------------------------------------------------------------------

describe('request', () => {
  // --------------------------------------------------------------------------
  // request
  // --------------------------------------------------------------------------

  describe('request', () => {
    it('get returns json', async function () {
      this.timeout(timeout)
      const status = await request('https://api.run.network/v1/test/status', { timeout })
      expect(status.ok).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('get returns buffer', async function () {
      this.timeout(timeout)
      const txid = '5332c013476cd2a2c18710a01188695bc27a5ef1748a51d4a5910feb1111dab4'
      const rawtx = await request(`https://api.run.network/v1/main/rawtx/${txid}`, { timeout })
      expect(rawtx.toString('hex').length).to.equal(3184)
    })

    // ------------------------------------------------------------------------

    it('posts json', async function () {
      this.timeout(timeout)
      const options = { method: 'POST', body: 'hello', timeout }
      const response = await request('https://httpbin.org/post', options)
      expect(response.data).to.equal('"hello"')
    })

    // ------------------------------------------------------------------------

    it('timeout', async function () {
      this.timeout(timeout)
      await expect(request('https://www.google.com:81', { timeout: 100 })).to.be.rejectedWith(TimeoutError)
    })

    // ------------------------------------------------------------------------

    it('client error', async function () {
      this.timeout(timeout)
      await expect(request('123', { timeout })).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('server error', async function () {
      this.timeout(timeout)
      await expect(request('https://api.run.network/badurl', { timeout })).to.be.rejectedWith(RequestError)
    })

    // ------------------------------------------------------------------------

    it('custom headers', async function () {
      this.timeout(timeout)
      const headers = { Date: (new Date()).toUTCString() }
      const response = await request('https://httpbin.org/get', { timeout, headers })
      expect(response.headers.Date).to.equal(headers.Date)
    })

    // ------------------------------------------------------------------------

    it('custom content-type', async function () {
      this.timeout(timeout)
      const headers = { 'content-type': 'application/text' }
      const options = { method: 'POST', body: 'hello', headers, timeout }
      const response = await request('https://httpbin.org/post', options)
      expect(response.data).to.equal('hello')
      expect(headers).to.deep.equal({ 'content-type': 'application/text' })
    })

    // ------------------------------------------------------------------------

    it('response handler', async function () {
      this.timeout(timeout)
      const options = { timeout, cache: 1000, response: stub().returns(100) }
      expect(await request('https://api.run.network/v1/test/status', options)).to.equal(100)
      expect(await request('https://api.run.network/v1/test/status', options)).to.equal(100)
      expect(options.response.callCount).to.equal(1)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _retry
  // ----------------------------------------------------------------------------------------------

  describe('_retry', () => {
    it('retries then succeeds', async () => {
      const f = stub()
      f.onCall(0).throws(new Error('timeout'))
      f.onCall(1).returns('hello')
      expect(await _retry(3, '', f)).to.equal('hello')
    })

    // ------------------------------------------------------------------------

    it('retries then fails', async () => {
      const f = stub()
      f.onCall(0).throws(new Error('timeout1'))
      f.onCall(1).throws(new Error('timeout2'))
      f.onCall(2).throws(new Error('timeout3'))
      f.onCall(3).throws(new Error('timeout4'))
      await expect(_retry(3, '', f)).to.be.rejectedWith('timeout4')
    })

    // ------------------------------------------------------------------------

    it('no timeout succeeds', async () => {
      const f = stub()
      f.onCall(0).returns('hello')
      expect(await _retry(0, '', f)).to.equal('hello')
    })

    // ------------------------------------------------------------------------

    it('no timeout fails', async () => {
      const f = stub()
      f.onCall(0).throws(new Error('timeout'))
      await expect(_retry(0, '', f)).to.be.rejectedWith('timeout')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _dedup
  // ----------------------------------------------------------------------------------------------

  describe('_dedup', () => {
    it('returns same result', async () => {
      const cache = {}
      let resolver = null
      let count = 0
      const f = () => new Promise((resolve, reject) => { count++; resolver = resolve })
      const key = '123'
      const result = 'abc'
      const promise1 = _dedup(cache, key, f)
      expect(key in cache).to.equal(true)
      const promise2 = _dedup(cache, key, f)
      resolver(result)
      expect(count).to.equal(1)
      expect(await promise1).to.equal(result)
      expect(await promise2).to.equal(result)
      expect(key in cache).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns same error', async () => {
      const cache = {}
      let rejecter = null
      let count = 0
      const error = new Error('abc')
      const f = () => new Promise((resolve, reject) => { count++; rejecter = reject })
      const key = '123'
      const promise1 = _dedup(cache, key, f)
      expect(key in cache).to.equal(true)
      const promise2 = _dedup(cache, key, f)
      rejecter(error)
      expect(count).to.equal(1)
      await expect(promise1).to.be.rejectedWith(error)
      await expect(promise2).to.be.rejectedWith(error)
      expect(key in cache).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('does not dedup after completion', async () => {
      const cache = {}
      let resolver = null
      let count = 0
      const f = () => new Promise((resolve, reject) => { count++; resolver = resolve })
      const key = '123'
      const promise1 = _dedup(cache, key, f)
      resolver('abc')
      expect(await promise1).to.equal('abc')
      const promise2 = _dedup(cache, key, f)
      resolver('def')
      expect(await promise2).to.equal('def')
      expect(count).to.equal(2)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _cache
  // ----------------------------------------------------------------------------------------------

  describe('_cache', () => {
    it('caches result', async () => {
      const cache = {}
      let count = 0
      const f = async () => { count++; return 'abc' }
      expect(await _cache(cache, '123', 10, f)).to.equal('abc')
      expect(await _cache(cache, '123', 10, f)).to.equal('abc')
      expect(count).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('caches error', async () => {
      const cache = {}
      let count = 0
      const error = new Error('abc')
      const f = async () => { count++; throw error }
      await expect(_cache(cache, '123', 10, f)).to.be.rejectedWith(error)
      await expect(_cache(cache, '123', 10, f)).to.be.rejectedWith(error)
      expect(count).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('expires result', async () => {
      const cache = {}
      let count = 0
      const f = async () => { count++; return 'abc' }
      expect(await _cache(cache, '123', 1, f)).to.equal('abc')
      await new Promise((resolve, reject) => setTimeout(resolve, 10))
      expect(await _cache(cache, '123', 1, f)).to.equal('abc')
      expect(count).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('expires error', async () => {
      const cache = {}
      let count = 0
      const error = new Error('abc')
      const f = async () => { count++; throw error }
      await expect(_cache(cache, '123', 1, f)).to.be.rejectedWith(error)
      await new Promise((resolve, reject) => setTimeout(resolve, 10))
      await expect(_cache(cache, '123', 1, f)).to.be.rejectedWith(error)
      expect(count).to.equal(2)
    })
  })

  // --------------------------------------------------------------------------

  describe('RequestError', () => {
    it('sets properties', () => {
      const error = new Run.errors.RequestError('Wifi off', 100, 'No connection', 'GET', 'http://localhost:8000/status')
      expect(error.name).to.equal('RequestError')
      expect(error.message).to.equal('100 No connection\n\nGET http://localhost:8000/status\n\nWifi off')
      expect(error.reason).to.equal('Wifi off')
      expect(error.status).to.equal(100)
      expect(error.statusText).to.equal('No connection')
      expect(error.method).to.equal('GET')
      expect(error.url).to.equal('http://localhost:8000/status')
    })
  })
})

// ------------------------------------------------------------------------------------------------
