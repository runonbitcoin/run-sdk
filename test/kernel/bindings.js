/**
 * bindings.js
 *
 * Tests for lib/kernel/bindings.js
 */

const { PrivateKey, Transaction } = require('bsv')
const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { CommonLock } = Run.util
const unmangle = require('../env/unmangle')
const { mangle } = unmangle
const { _location, _compileLocation, _nonce, _satoshis, _owner, _markUndeployed } = unmangle(unmangle(Run)._Bindings)

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TXID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// ------------------------------------------------------------------------------------------------
// Bindings
// ------------------------------------------------------------------------------------------------

describe('Bindings', () => {
  // ----------------------------------------------------------------------------------------------
  // _location
  // ----------------------------------------------------------------------------------------------

  describe('_location', () => {
    it('valid locations', () => {
      // Jigs
      expect(_location(`${TXID}_o0`)).to.deep.equal(mangle({ _txid: TXID, _vout: 0 }))
      expect(_location(`${TXID}_d1`)).to.deep.equal(mangle({ _txid: TXID, _vdel: 1 }))
      expect(_location('native://Jig')).to.deep.equal(mangle({ _native: 'Jig' }))
      // Partial jigs
      expect(_location('_o10')).to.deep.equal(mangle({ _vout: 10 }))
      expect(_location('_d1')).to.deep.equal(mangle({ _vdel: 1 }))
      // Berries
      expect(_location(`${TXID}_o0?berry=&hash=${HASH}&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: '', _hash: HASH, _version: 5 }))
      expect(_location(`${TXID}_o0?berry=abc&hash=${HASH}&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: 'abc', _hash: HASH, _version: 5 }))
      expect(_location(`${TXID}_d0?berry=${TXID}_o0&hash=${HASH}&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vdel: 0, _berry: `${TXID}_o0`, _hash: HASH, _version: 5 }))
      expect(_location(`${TXID}_o0?berry=line1%0Aline2&hash=${HASH}&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: 'line1\nline2', _hash: HASH, _version: 5 }))
      expect(_location(`${TXID}_o0?berry=${encodeURIComponent('😀')}&hash=${HASH}&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: '😀', _hash: HASH, _version: 5 }))
      // Partial berries
      expect(_location(`${TXID}_o0?berry=&version=5`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: '', _version: 5 }))
      expect(_location(`${TXID}_o0?berry=&hash=${HASH}`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: '', _hash: HASH }))
      expect(_location(`${TXID}_o0?berry=abc`))
        .to.deep.equal(mangle({ _txid: TXID, _vout: 0, _berry: 'abc' }))
      // Errors
      expect(_location('error://')).to.deep.equal(mangle({ _error: '' }))
      expect(_location('error://Something bad happened')).to.deep.equal(mangle({ _error: 'Something bad happened' }))
      expect(_location('error://line1\nline2')).to.deep.equal(mangle({ _error: 'line1\nline2' }))
      expect(_location('error://Undeployed')).to.deep.equal(mangle({ _error: 'Undeployed', _undeployed: true }))
      // Record locations
      expect(_location(`record://${TXID}_o1`)).to.deep.equal(mangle({ _record: TXID, _vout: 1 }))
      expect(_location(`record://${TXID}_d2`)).to.deep.equal(mangle({ _record: TXID, _vdel: 2 }))
    })

    // ------------------------------------------------------------------------

    it('throws for invalid locations', () => {
      // Invalid types
      expect(() => _location()).to.throw()
      expect(() => _location(1)).to.throw()
      expect(() => _location({})).to.throw()
      expect(() => _location(null)).to.throw()
      // Bad creation structure
      expect(() => _location(`${TXID}`)).to.throw()
      expect(() => _location(`${TXID}_`)).to.throw()
      expect(() => _location(`${TXID}_i0`)).to.throw()
      expect(() => _location(`${TXID}_r0`)).to.throw()
      expect(() => _location(`${TXID}_j0`)).to.throw()
      expect(() => _location(`${TXID}_o`)).to.throw()
      expect(() => _location(`${TXID}_i`)).to.throw()
      expect(() => _location(`${TXID}_0`)).to.throw()
      expect(() => _location(`${TXID}_a0`)).to.throw()
      expect(() => _location(`_${TXID}_o0`)).to.throw()
      // Bad partial creation structure
      expect(() => _location('_i0')).to.throw()
      expect(() => _location('_r0')).to.throw()
      // Bad berry structure
      expect(() => _location(`${TXID}_o0_berry=abc&hash=${HASH}&version=5`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=abc+hash=${HASH}+version=5`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=abc&hash=${HASH}&version=0`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=abc&hash=${HASH}&version=abc`)).to.throw()
      expect(() => _location(`${TXID}_o0?hash=${HASH}&version=5`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=abc&hash=abc&version=5`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=%abc&hash=${HASH}&version=5`)).to.throw()
      expect(() => _location(`_d1?berry=abc&hash=${HASH}&version=5`)).to.throw()
      // Bad record structure
      expect(() => _location(`record://${TXID}_o`)).to.throw()
      expect(() => _location(`record://${TXID}_0`)).to.throw()
      expect(() => _location(`record://${TXID}_j1`)).to.throw()
      expect(() => _location('record://_o1')).to.throw()
      expect(() => _location('record://_d2')).to.throw()
      // Bad record structure
      expect(() => _location('native://')).to.throw()
      expect(() => _location('native://!')).to.throw()
      // Bad lengths
      expect(() => _location('abc_o0')).to.throw()
      expect(() => _location('record://abc_o1')).to.throw()
      // Invalid chars
      expect(() => _location('$_o1')).to.throw()
      expect(() => _location(`${TXID}_o*`)).to.throw()
      expect(() => _location(`${TXID}-o1`)).to.throw()
      expect(() => _location(`${TXID}_o0?berry=\n&hash=${HASH}&version=5`)).to.throw()
      // Bad schemes
      expect(() => _location(`commit:${TXID}_o1`)).to.throw()
      expect(() => _location(`tmp://${TXID}_o1`)).to.throw()
      expect(() => _location(`error:/${TXID}_o1`)).to.throw()
      expect(() => _location(`err://${TXID}_o1`)).to.throw()
      expect(() => _location('nat://Jig')).to.throw()
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _compileLocation
  // ----------------------------------------------------------------------------------------------

  describe('_compileLocation', () => {
    it('error', () => {
      expect(_compileLocation(mangle({ _error: '123' }))).to.equal('error://123')
      expect(_compileLocation(mangle({ _error: '😀' }))).to.equal('error://😀')
    })

    // ------------------------------------------------------------------------

    it('native', () => {
      expect(_compileLocation(mangle({ _native: 'Code' }))).to.equal('native://Code')
      expect(_compileLocation(mangle({ _native: 'CommonLock' }))).to.equal('native://CommonLock')
    })

    // ------------------------------------------------------------------------

    it('record', () => {
      expect(_compileLocation(mangle({ _record: TXID, _vout: 0 }))).to.equal(`record://${TXID}_o0`)
      expect(_compileLocation(mangle({ _record: TXID, _vdel: 1 }))).to.equal(`record://${TXID}_d1`)
    })

    // ------------------------------------------------------------------------

    it('jig', () => {
      expect(_compileLocation(mangle({ _txid: TXID, _vout: 0 }))).to.equal(`${TXID}_o0`)
      expect(_compileLocation(mangle({ _txid: TXID, _vdel: 1 }))).to.equal(`${TXID}_d1`)
    })

    // ------------------------------------------------------------------------

    it('partial jig', () => {
      expect(_compileLocation(mangle({ _vout: 1 }))).to.equal('_o1')
      expect(_compileLocation(mangle({ _vdel: 0 }))).to.equal('_d0')
    })

    // ------------------------------------------------------------------------

    it('berry', () => {
      expect(_compileLocation(mangle({ _txid: TXID, _vout: 0, _berry: 'abc', _hash: HASH, _version: 5 })))
        .to.equal(`${TXID}_o0?berry=abc&hash=${HASH}&version=5`)
    })

    // ------------------------------------------------------------------------

    it('partial berry', () => {
      expect(_compileLocation(mangle({ _txid: TXID, _vout: 0, _berry: '😀' })))
        .to.equal(`${TXID}_o0?berry=${encodeURIComponent('😀')}`)
      expect(_compileLocation(mangle({ _txid: TXID, _vout: 0, _berry: '😀', _version: 6 })))
        .to.equal(`${TXID}_o0?berry=${encodeURIComponent('😀')}&version=6`)
    })

    // ------------------------------------------------------------------------

    it('throws if not an object', () => {
      expect(() => _compileLocation()).to.throw()
      expect(() => _compileLocation(null)).to.throw()
      expect(() => _compileLocation(123)).to.throw()
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _nonce
  // ----------------------------------------------------------------------------------------------

  describe('_nonce', () => {
    it('supports valid nonce', () => {
      _nonce(1)
      _nonce(Number.MAX_SAFE_INTEGER)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid nonce', () => {
      expect(() => _nonce(0)).to.throw()
      expect(() => _nonce(-1)).to.throw()
      expect(() => _nonce(1.5)).to.throw()
      expect(() => _nonce(Infinity)).to.throw()
      expect(() => _nonce(NaN)).to.throw()
      expect(() => _nonce(null)).to.throw()
      expect(() => _nonce()).to.throw()
      expect(() => _nonce('2')).to.throw()
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _owner
  // ----------------------------------------------------------------------------------------------

  describe('_owner', () => {
    it('supports valid owners on different networks', () => {
      for (const bsvNetwork of ['mainnet', 'testnet']) {
        const privkey = new PrivateKey(bsvNetwork)
        const pubkey = privkey.publicKey.toString()
        const addr = privkey.toAddress().toString()
        const bytes = new CommonLock(addr).script()
        expect(_owner(pubkey).script()).to.deep.equal(bytes)
        expect(_owner(addr).script()).to.deep.equal(bytes)
        expect(_owner(new CommonLock(addr)).script()).to.deep.equal(bytes)
      }
    })

    // ------------------------------------------------------------------------

    it('throws if bad owner', () => {
      expect(() => _owner()).to.throw('Invalid owner: undefined')
      expect(() => _owner(null)).to.throw('Invalid owner: null')
      expect(() => _owner(123)).to.throw('Invalid owner: 123')
      expect(() => _owner('hello')).to.throw('Invalid owner: "hello"')
      expect(() => _owner(new PrivateKey())).to.throw('Invalid owner')
      expect(() => _owner(new PrivateKey().publicKey)).to.throw('Invalid owner')
      expect(() => _owner([new PrivateKey().publicKey.toString()])).to.throw('Invalid owner')
    })

    // ------------------------------------------------------------------------

    it('allows null', () => {
      expect(_owner(null, true)).to.equal(null)
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _satoshis
  // ----------------------------------------------------------------------------------------------

  describe('_satoshis', () => {
    it('allowed values', () => {
      expect(() => _satoshis(0)).not.to.throw()
      expect(() => _satoshis(1)).not.to.throw()
      expect(() => _satoshis(Transaction.DUST_AMOUNT)).not.to.throw()
      expect(() => _satoshis(100000000)).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if bad satoshis', () => {
      expect(() => _satoshis()).to.throw('satoshis must be a number')
      expect(() => _satoshis(-1)).to.throw('satoshis must be non-negative')
      expect(() => _satoshis('0')).to.throw('satoshis must be a number')
      expect(() => _satoshis([0])).to.throw('satoshis must be a number')
      expect(() => _satoshis(1.5)).to.throw('satoshis must be an integer')
      expect(() => _satoshis(NaN)).to.throw('satoshis must be an integer')
      expect(() => _satoshis(Infinity)).to.throw('satoshis must be an integer')
      expect(() => _satoshis(100000001)).to.throw('satoshis must be <= 100000000')
      expect(() => _satoshis(null)).to.throw('satoshis must be a number')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _markUndeployed
  // ----------------------------------------------------------------------------------------------

  describe('_markUndeployed', () => {
    it('initializess undeployed bindings', () => {
      const o = {}
      _markUndeployed(o)
      expect(o.origin).to.equal('error://Undeployed')
      expect(o.location).to.equal('error://Undeployed')
      expect(o.nonce).to.equal(0)
      expect(o.owner).to.equal(undefined)
      expect(o.satoshis).to.equal(undefined)
    })
  })
})

// ------------------------------------------------------------------------------------------------
