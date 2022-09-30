/**
 * cache.js
 *
 * Tests for cache functionality
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { LocalCache } = Run.plugins
const { Jig } = Run

// ------------------------------------------------------------------------------------------------
// Cache
// ------------------------------------------------------------------------------------------------

describe('Cache', () => {
  // --------------------------------------------------------------------------
  // filter
  // --------------------------------------------------------------------------

  describe('filter', () => {
    it('sets code filter for new code', async () => {
      const run = new Run({ cache: new LocalCache() })
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
      const filter = await run.cache.get('config://code-filter')
      expect(filter.buckets.some(x => x > 0)).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('updates code filter for new code', async () => {
      const run = new Run({ cache: new LocalCache() })
      run.cache = new LocalCache()
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
      const buckets1 = Array.from((await run.cache.get('config://code-filter')).buckets)
      class B extends Jig { }
      run.deploy(B)
      await run.sync()
      const buckets2 = Array.from((await run.cache.get('config://code-filter')).buckets)
      expect(buckets1).not.to.deep.equal(buckets2)
    })

    // ------------------------------------------------------------------------

    it('does not update code filter for jigs or berries', async () => {
      const run = new Run({ cache: new LocalCache() })
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
      const buckets1 = Array.from((await run.cache.get('config://code-filter')).buckets)
      const a = new A()
      await a.sync()
      const buckets2 = Array.from((await run.cache.get('config://code-filter')).buckets)
      expect(buckets1).to.deep.equal(buckets2)
    })
  })
})

// ------------------------------------------------------------------------------------------------
