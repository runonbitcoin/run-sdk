/**
 * recreate.js
 *
 * Tests for lib/kernel/recreate.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Recreate
// ------------------------------------------------------------------------------------------------

describe('Recreate', () => {
  describe('Errors', () => {
    it('throws if state hash mismatch', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      await run.sync()
      const state = await run.cache.get(`jig://${A.location}`)
      state.props.name = 'B'
      run.cache = new LocalCache()
      await run.cache.set('jig://' + A.location, state)
      await expect(run.load(A.location)).to.be.rejectedWith(`Cannot recreate ${A.location} from an incorrect state`)
    })

    // ------------------------------------------------------------------------

    it('throws if kind is invalid', async () => {
      const run = new Run()
      run.trust('state')
      class A { }
      run.deploy(A)
      await run.sync()
      const state = await run.cache.get(`jig://${A.location}`)
      state.kind = 'annotation'
      run.cache = new LocalCache()
      await run.cache.set('jig://' + A.location, state)
      await expect(run.load(A.location)).to.be.rejectedWith(`Cannot recreate ${A.location} from an invalid state`)
    })
  })
})

// ------------------------------------------------------------------------------------------------
