/**
 * sandbox.js
 *
 * Tests for lib/kernel/sandbox.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const Sandbox = unmangle(unmangle(Run)._Sandbox)

// ------------------------------------------------------------------------------------------------
// Sandbox
// ------------------------------------------------------------------------------------------------

describe('Sandbox', () => {
  it('proxies console', () => {
    const logs = []
    const oldConsoleLog = console.log
    try {
      console.log = (msg) => logs.push(msg)
      Sandbox._evaluate('console.log("hello")')
      const A = Sandbox._evaluate('class A { static f() { console.log("world") } }')[0]
      A.f()
    } finally {
      console.log = oldConsoleLog
    }
    expect(logs).to.deep.equal(['hello', 'world'])
  })

  // --------------------------------------------------------------------------

  it('configuration objects not present', () => {
    expect(Sandbox._evaluate('typeof _makeDeterministic')[0]).to.equal('undefined')
    expect(Sandbox._evaluate('typeof SES')[0]).to.equal('undefined')
    expect(Sandbox._evaluate('typeof Compartment')[0]).to.equal('undefined')
    expect(Sandbox._evaluate('typeof m')[0]).to.equal('undefined')
    expect(Sandbox._evaluate('typeof n')[0]).to.equal('undefined')
    expect(Sandbox._evaluate('typeof C')[0]).to.equal('undefined')
  })
})

// ------------------------------------------------------------------------------------------------
