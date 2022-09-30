/**
 * satoshis.js
 *
 * Tests for setting the satoshis binding
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// satoshis
// ------------------------------------------------------------------------------------------------

describe('satoshis', () => {
  async function testSatoshisPass (amount) {
    const run = new Run()
    class A extends Jig { f (s) { this.satoshis = s } }
    const a = new A()
    a.f(amount)
    await a.sync()
    const a2 = await run.load(a.location)
    expect(a2.satoshis).to.equal(amount)
    run.cache = new LocalCache()
    const a3 = await run.load(a.location)
    expect(a3.satoshis).to.equal(amount)
  }

  // ------------------------------------------------------------------------

  // minimum amount
  it('set to 0', () => testSatoshisPass(0))

  // less than dust
  it('set to 50', () => testSatoshisPass(50))

  // more than dust
  it('set to 600', () => testSatoshisPass(600))

  // ------------------------------------------------------------------------

  it('update backing limit', () => {
    const oldBackingLimit = Run.defaults.backingLimit
    Run.defaults.backingLimit = 200000000
    testSatoshisPass(100000001)
    Run.defaults.backingLimit = oldBackingLimit
  })

  // ------------------------------------------------------------------------

  it('loads higher backing limit', async () => {
    const oldBackingLimit = Run.defaults.backingLimit
    const run = new Run()
    run.backingLimit = 200000000
    class A extends Jig { f (s) { this.satoshis = s } }
    const a = new A()
    const amount = 100000001
    a.f(amount)
    await a.sync()
    run.backingLimit = oldBackingLimit
    const a2 = await run.load(a.location)
    expect(a2.satoshis).to.equal(amount)
    run.cache = new LocalCache()
    const a3 = await run.load(a.location)
    expect(a3.satoshis).to.equal(amount)
  })

  // ------------------------------------------------------------------------

  function testFailToSet (amount, error) {
    new Run() // eslint-disable-line
    class A extends Jig { f (s) { this.satoshis = s } }
    const a = new A()
    expect(() => a.f(amount)).to.throw(error)
  }

  // ------------------------------------------------------------------------

  it('throws if set to negative', () => testFailToSet(-1, 'satoshis must be non-negative'))
  it('throws if set to float', () => testFailToSet(1.1, 'satoshis must be an integer'))
  it('throws if set to string', () => testFailToSet('1', 'satoshis must be a number'))
  it('throws if set above 100M', () => testFailToSet(100000001, 'satoshis must be <= 100000000'))
  it('throws if set to NaN', () => testFailToSet(NaN, 'satoshis must be an integer'))
  it('throws if set to Infinity', () => testFailToSet(Infinity, 'satoshis must be an integer'))
  it('throws if set to undefined', () => testFailToSet(undefined, 'satoshis must be a number'))

  // ------------------------------------------------------------------------

  it('throws if read while unbound', () => {
    new Run() // eslint-disable-line
    class A extends Jig { init () { this.satoshisAtInit = this.satoshis }}
    expect(() => new A()).to.throw('Cannot read satoshis')
  })

  // ------------------------------------------------------------------------

  it('throws if delete', () => {
    new Run() // eslint-disable-line
    class A extends Jig { f () { delete this.satoshis }}
    const a = new A()
    expect(() => { delete a.satoshis }).to.throw('Cannot delete satoshis')
    expect(() => a.f()).to.throw('Cannot delete satoshis')
  })

  // ------------------------------------------------------------------------

  it('throws if set externally', () => {
    new Run () // eslint-disable-line
    class A extends Jig { }
    const a = new A()
    const error = 'Attempt to update [jig A] outside of a method'
    expect(() => { a.satoshis = 1 }).to.throw(error)
  })
})

// ------------------------------------------------------------------------------------------------
