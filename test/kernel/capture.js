// Test key order is deterministic

/*
    it('caches local updates', async () => {
      const run = createHookedRun()
      class A extends Jig {
        init () { this.undef = undefined }

        set (n) { this.n = n }
      }
      const a = new A()
      for (let i = 0; i < 10; i++) {
        a.set(i)
      }
      const b = new A()
      run.transaction.begin()
      const b2 = new A()
      a.set({ b, b2, A })
      run.transaction.end()
      b.set(1)
      await a.sync()

      const run2 = new Run({ cache: new LocalCache() })
      const t0 = Date.now()
      await run2.load(a.location)
      const t1 = Date.now()
      await run2.load(a.location)
      const t2 = Date.now()
      expect((t1 - t0) / (t2 - t1) > 3).to.equal(true) // Load without cache is 3x slower
    })
    */
