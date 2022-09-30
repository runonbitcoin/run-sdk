/**
 * kernel.js
 *
 * Tests for the kernel
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig } = Run

// ------------------------------------------------------------------------------------------------
// Kernel
// ------------------------------------------------------------------------------------------------

describe('Kernel', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  it('throws if activate different kernel during transaction', async () => {
    const run = new Run()
    class A extends Jig {}
    const a = new A()
    const b = new A()
    const tx = new Run.Transaction()
    await run.sync()
    tx.update(() => a.auth())
    new Run() // eslint-disable-line
    const error = 'Different Run instances must not be used to produce a single update'
    expect(() => tx.update(() => b.auth())).to.throw(error)
    expect(a.nonce).to.equal(1)
    expect(b.nonce).to.equal(1)
  })
})

// ------------------------------------------------------------------------------------------------
