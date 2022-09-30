/**
 * error.js
 *
 * Tests for lib/kernel/error.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')

// ------------------------------------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------------------------------------

describe('Error', () => {
  it('ArgumentError', () => {
    const error = new Run.errors.ArgumentError('hello')
    expect(error.name).to.equal('ArgumentError')
    expect(error.message).to.equal('hello')
  })

  // --------------------------------------------------------------------------

  it('ClientModeError', () => {
    const error = new Run.errors.ClientModeError('abc', 'jig')
    expect(error.name).to.equal('ClientModeError')
    expect(error.message).to.equal('Cannot load abc\n\nOnly cached jigs may be loaded in client mode')
    expect(error.data).to.equal('abc')
    expect(error.type).to.equal('jig')
  })

  // --------------------------------------------------------------------------

  it('InternalError', () => {
    const error = new Run.errors.InternalError('hello')
    expect(error.name).to.equal('InternalError')
    expect(error.message).to.equal('hello')
  })

  // --------------------------------------------------------------------------

  it('NotImplementedError', () => {
    const error = new Run.errors.NotImplementedError('hello')
    expect(error.name).to.equal('NotImplementedError')
    expect(error.message).to.equal('hello')
  })

  // --------------------------------------------------------------------------

  it('TimeoutError', () => {
    const error = new Run.errors.TimeoutError('hello')
    expect(error.name).to.equal('TimeoutError')
    expect(error.message).to.equal('hello')
  })

  // --------------------------------------------------------------------------

  it('TrustError', () => {
    const error = new Run.errors.TrustError('abc', 'replay')
    expect(error.name).to.equal('TrustError')
    const hint = 'Hint: Trust this txid using run.trust(txid) if you know it is safe'
    expect(error.message).to.equal(`Cannot load untrusted code via replay: abc\n\n${hint}`)
    expect(error.txid).to.equal('abc')
    expect(error.from).to.equal('replay')
  })
})

// ------------------------------------------------------------------------------------------------
