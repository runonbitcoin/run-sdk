/**
 * sha256.js
 *
 * Tests for lib/extra/sha256.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { sha256, Hex } = Run.extra
const crypto = require('crypto')

// ------------------------------------------------------------------------------------------------
// nodeSha256
// ------------------------------------------------------------------------------------------------

const nodeSha256 = x => {
  const hash = crypto.createHash('sha256')
  hash.update(Buffer.from(x))
  return hash.digest().toString('hex')
}

// ------------------------------------------------------------------------------------------------
// sha256
// ------------------------------------------------------------------------------------------------

describe('sha256', () => {
  it('matches node sha256', () => {
    for (let i = 0; i < 100; i++) {
      const bytes = Array.from(crypto.randomBytes(Math.ceil(Math.random() * 1024)))
      const expected = nodeSha256(bytes)
      const actual = Hex.bytesToString(sha256(bytes))
      expect(actual).to.equal(expected)
    }
  })

  // --------------------------------------------------------------------------

  it('throws for non-hex value', () => {
    expect(() => sha256()).to.throw('Invalid bytes')
    expect(() => sha256(1)).to.throw('Invalid bytes')
    expect(() => sha256(null)).to.throw('Invalid bytes')
    expect(() => sha256('a')).to.throw('Invalid bytes')
  })
})

// ------------------------------------------------------------------------------------------------
