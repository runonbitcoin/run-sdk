/**
 * code.js
 *
 * Tests for native code (Jig, Berry)
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { Code, Jig, Berry } = Run

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const NATIVE = [Jig, Berry]

// ------------------------------------------------------------------------------------------------
// Native
// ------------------------------------------------------------------------------------------------

describe('Native', () => {
  it('is instanceof Code', () => {
    NATIVE.forEach(N => expect(N instanceof Code).to.equal(true))
  })

  it('returns native code if deploy', () => {
    const run = new Run()
    NATIVE.forEach(N => expect(run.deploy(N)).to.equal(N))
  })

  it('throws if define property', () => {
    NATIVE.forEach(N => expect(() => Object.defineProperty(N, 'x', { value: 1 })).to.throw())
  })

  it('throws if delete property', () => {
    NATIVE.forEach(N => expect(() => { delete N.x }).to.throw())
  })

  it('cannot prevent extensions', () => {
    NATIVE.forEach(N => expect(() => Object.preventExtensions(N)).to.throw())
  })

  it('throws if set property', () => {
    NATIVE.forEach(N => expect(() => { N.x = 1 }).to.throw())
  })

  it('throws if set prototype', () => {
    NATIVE.forEach(N => expect(() => Object.setPrototypeOf(N, {})).to.throw())
  })

  it('has native bindings', () => {
    NATIVE.forEach(N => {
      expect(N.location).to.equal('native://' + N.name)
      expect(N.origin).to.equal('native://' + N.name)
      expect(N.nonce).to.equal(0)
      expect(N.owner).to.equal(null)
      expect(N.satoshis).to.equal(0)
    })
  })

  it('toString should not return actual source code', () => {
    NATIVE.forEach(N => expect(N.toString().indexOf('[native code]')).not.to.equal(-1))
  })

  it('cannot destroy', () => {
    const error = 'destroy unavailable'
    NATIVE.forEach(N => expect(() => Code.prototype.destroy.apply(N)).to.throw(error))
  })

  it('cannot auth', () => {
    const error = 'auth unavailable'
    NATIVE.forEach(N => expect(() => Code.prototype.auth.apply(N)).to.throw(error))
  })

  it('cannot upgrade', () => {
    const error = 'upgrade unavailable'
    NATIVE.forEach(N => expect(() => Code.prototype.upgrade.apply(N, class A { })).to.throw(error))
  })

  it('sync does nothing', () => {
    NATIVE.forEach(N => expect('sync' in N).to.equal(true))
    NATIVE.forEach(N => N.sync())
    NATIVE.forEach(N => Code.prototype.sync.apply(N))
  })
})

// ------------------------------------------------------------------------------------------------
