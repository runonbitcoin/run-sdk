/**
 * version.js
 *
 * Tests for test/kernel/version.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const {
  _version,
  _parseMetadataVersion,
  _parseStateVersion,
  _getMetadataVersion,
  _getStateVersion
} = unmangle(unmangle(Run)._version)

// ------------------------------------------------------------------------------------------------
// _version
// ------------------------------------------------------------------------------------------------

describe('_version', () => {
  it('returns version if supported', () => {
    expect(_version(5)).to.equal(5)
    expect(_version(Run.protocol)).to.equal(5)
  })

  // --------------------------------------------------------------------------

  it('throws if unsupported', () => {
    expect(() => _version(4)).to.throw('Unsupported version: 4')
    expect(() => _version(6)).to.throw('Unsupported version: 6')
    expect(() => _version(null)).to.throw('Unsupported version: null')
    expect(() => _version()).to.throw('Unsupported version: undefined')
    expect(() => _version('5')).to.throw('Unsupported version: 5')
  })
})

// ------------------------------------------------------------------------------------------------
// _parseMetadataVersion
// ------------------------------------------------------------------------------------------------

describe('_parseMetadataVersion', () => {
  it('returns parsed version', () => {
    expect(_parseMetadataVersion('05')).to.equal(5)
  })

  // --------------------------------------------------------------------------

  it('throws if unsupported', () => {
    const hint = 'Hint: Upgrade your Run SDK to load this transaction'
    expect(() => _parseMetadataVersion()).to.throw('Unsupported RUN transaction version: undefined')
    expect(() => _parseMetadataVersion(5)).to.throw('Unsupported RUN transaction version: 5')
    expect(() => _parseMetadataVersion('04')).to.throw('Unsupported RUN transaction version: 04')
    expect(() => _parseMetadataVersion('06')).to.throw(`Unsupported RUN transaction version: 06\n\n${hint}`)
    expect(() => _parseMetadataVersion('0005')).to.throw('Unsupported RUN transaction version: 0005')
  })
})

// ------------------------------------------------------------------------------------------------
// _parseStateVersion
// ------------------------------------------------------------------------------------------------

describe('_parseStateVersion', () => {
  it('returns parsed version', () => {
    expect(_parseStateVersion('04')).to.equal(5)
  })

  // --------------------------------------------------------------------------

  it('throws if unsupported', () => {
    expect(() => _parseStateVersion()).to.throw('Unsupported state version: undefined')
    expect(() => _parseStateVersion(4)).to.throw('Unsupported state version: 4')
    expect(() => _parseStateVersion(5)).to.throw('Unsupported state version: 5')
    expect(() => _parseStateVersion('03')).to.throw('Unsupported state version: 03')
    expect(() => _parseStateVersion('05')).to.throw('Unsupported state version: 05')
    expect(() => _parseStateVersion('0004')).to.throw('Unsupported state version: 0004')
  })
})

// ------------------------------------------------------------------------------------------------
// _getMetadataVersion
// ------------------------------------------------------------------------------------------------

describe('_getMetadataVersion', () => {
  it('returns converted version', () => {
    expect(_getMetadataVersion(5)).to.equal('05')
  })

  // --------------------------------------------------------------------------

  it('throws if unsupported', () => {
    expect(() => _getMetadataVersion()).to.throw('Unsupported protocol version: undefined')
    expect(() => _getMetadataVersion(6)).to.throw('Unsupported protocol version: 6')
    expect(() => _getMetadataVersion(4)).to.throw('Unsupported protocol version: 4')
    expect(() => _getMetadataVersion('05')).to.throw('Unsupported protocol version: 05')
  })
})

// ------------------------------------------------------------------------------------------------
// _getStateVersion
// ------------------------------------------------------------------------------------------------

describe('_getStateVersion', () => {
  it('returns converted version', () => {
    expect(_getStateVersion(5)).to.equal('04')
  })

  // --------------------------------------------------------------------------

  it('throws if unsupported', () => {
    expect(() => _getStateVersion()).to.throw('Unsupported protocol version: undefined')
    expect(() => _getStateVersion(6)).to.throw('Unsupported protocol version: 6')
    expect(() => _getStateVersion(4)).to.throw('Unsupported protocol version: 4')
    expect(() => _getStateVersion('05')).to.throw('Unsupported protocol version: 05')
  })
})

// ------------------------------------------------------------------------------------------------
