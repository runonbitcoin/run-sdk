/**
 * stress.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const { STRESS } = require('../env/config')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Stress
// ------------------------------------------------------------------------------------------------

if (STRESS) {
  describe('Stress', () => {
    it('long chain', async () => {
      const run = new Run({ timeout: Number.MAX_VALUE })
      let last = null
      class B extends Jig { set (n) { this.n = n } }

      const b = new B()
      for (let i = 0; i < 100; i++) {
        run.transaction(() => {
          b.set(i)
          class A { }
          A.last = last
          last = run.deploy(A)
        })
        if (i % 10 === 0) run.blockchain.block()
        await last.sync()
      }

      const start = new Date()
      await run.load(last.location)
      expect(new Date() - start < 1000).to.equal(true)

      const start2 = new Date()
      run.cache = new LocalCache()
      await run.load(b.location)
      expect(new Date() - start2 < 10000).to.equal(true)
    })

    // -------------------------------------------------------------------------

    it('neural graph', async () => {
      const run = new Run()

      class A extends Jig {
        init (n, ...links) {
          this.n = n
          links.forEach(link => { this.n += link.n })
        }
      }

      const width = 10
      const cols = []
      let n = 0

      for (let x = 0; x < width; x++) {
        const col = []
        const prev = cols[cols.length - 1]
        const height = width - x

        n += height

        for (let y = 0; y < height; y++) {
          if (x === 0) {
            const a = new A(y + 1)
            col.push(a)
          }

          if (x !== 0) {
            const a = new A(0, ...prev)
            col.push(a)
          }
        }

        cols.push(col)
        await run.sync()
      }

      console.log('Loading ' + n + ' interconnected jigs forward')
      const start = new Date()
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < cols[x].length; y++) {
          await run.load(cols[x][y].location)
        }
      }
      const first = new Date() - start
      console.log(first + 'ms')

      console.log('Loading ' + n + ' interconnected jigs backward')
      const start2 = new Date()
      const last = cols[cols.length - 1][0]
      run.cache = new LocalCache()
      await run.load(last.location)
      const second = new Date() - start2
      console.log(second + 'ms')

      // Make sure that loading backwards is still relatively fast
      expect(first < 3000).to.equal(true)
      expect(second < 3000).to.equal(true)
      expect((second - first) / first < 10).to.equal(true)
    })

    // -------------------------------------------------------------------------

    it('many publishes', async () => {
      const run = new Run()
      class A extends Jig { }
      for (let i = 0; i < 500; i++) {
        const a = new A()
        await a.sync()
        if (i % 10 === 0) run.blockchain.block()
      }
    })

    // -------------------------------------------------------------------------

    it('many loads', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      for (let i = 0; i < 500; i++) {
        run.cache = new LocalCache()
        await run.load(a.location)
        await run.load(a.location)
      }
    })
  })
}

// ------------------------------------------------------------------------------------------------
