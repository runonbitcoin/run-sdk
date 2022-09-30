/**
 * trust.js
 *
 * Tests for loading trusted and untrusted code
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Trust
// ------------------------------------------------------------------------------------------------

describe('Trust', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('throws if invalid', () => {
      expect(() => new Run({ trust: null })).to.throw('Not trustable')
      expect(() => new Run({ trust: {} })).to.throw('Not trustable')
      expect(() => new Run({ trust: 'abc' })).to.throw('Not trustable')
      expect(() => new Run({ trust: '0000000000000000000000000000000000000000000000000000000000000000_o0' })).to.throw('Not trustable')
      expect(() => new Run({ trust: '**' })).to.throw('Not trustable')
    })
  })

  // --------------------------------------------------------------------------
  // trust
  // --------------------------------------------------------------------------

  describe('trust', () => {
    it('trust *', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.cache = new LocalCache()
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code via replay')
      run2.trust('*')
      await run2.load(A.location)
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('trust txid', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.cache = new LocalCache()
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code via replay')
      run2.trust(A.location.slice(0, 64))
      await run2.load(A.location)
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid', () => {
      const run = new Run()
      expect(() => run.trust(null)).to.throw('Not trustable')
      expect(() => run.trust({})).to.throw('Not trustable')
      expect(() => run.trust('abc')).to.throw('Not trustable')
      expect(() => run.trust('0000000000000000000000000000000000000000000000000000000000000000_o0')).to.throw('Not trustable')
      expect(() => run.trust('')).to.throw('Not trustable')
    })
  })

  // --------------------------------------------------------------------------
  // Trusted Code
  // --------------------------------------------------------------------------

  describe('Trusted Code', () => {
    it('imports trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: A.location.slice(0, 64) })
      const rawtx = await run.blockchain.fetch(A.location.slice(0, 64))
      await run2.import(rawtx)
    })

    // ------------------------------------------------------------------------

    it('loads via replay trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: A.location.slice(0, 64) })
      run2.cache = new LocalCache()
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('loads via state trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(A.location.slice(0, 64))
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('loads via state if origin is trusted', async () => {
      const run = new Run()
      class A extends Jig { }
      class B extends Jig { }
      const C = run.deploy(A)
      C.upgrade(B)
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(C.origin.slice(0, 64))
      await run2.load(C.location)
    })
  })

  // --------------------------------------------------------------------------
  // Dependencies
  // --------------------------------------------------------------------------

  describe('Dependencies', () => {
    it('throws if imports untrusted dependency of trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      const B = run.deploy(class B extends A { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(B.location.slice(0, 64))
      run2.cache = new LocalCache()
      const rawtx = await run2.blockchain.fetch(B.location.slice(0, 64))
      await expect(run2.import(rawtx)).to.be.rejectedWith('Cannot load untrusted code')
    })

    // ------------------------------------------------------------------------

    it('throws if loads untrusted dependencies of trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      const B = run.deploy(class B extends A { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(B.location.slice(0, 64))
      run2.cache = new LocalCache()
      await expect(run2.load(B.location)).to.be.rejectedWith('Cannot load untrusted code')
    })

    // ------------------------------------------------------------------------

    it('throws if load untrusted inputs of trusted', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      const B = run.deploy(class B extends A { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(B.location.slice(0, 64))
      run2.cache = new LocalCache()
      await expect(run2.load(B.location)).to.be.rejectedWith('Cannot load untrusted code')
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code')
    })

    // ------------------------------------------------------------------------

    it('throws if load untrusted references of trusted', async () => {
      const run = new Run()
      class A { }
      class B { }
      B.A = A
      run.deploy(A)
      run.deploy(B)
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(B.location.slice(0, 64))
      run2.cache = new LocalCache()
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code')
      await expect(run2.load(B.location)).to.be.rejectedWith('Cannot load untrusted code')
    })

    // ------------------------------------------------------------------------

    it('throws if load updated references of trusted', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      CA.auth()
      class B { }
      B.A = CA
      const CB = run.deploy(B)
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(CB.location.slice(0, 64))
      run2.cache = new LocalCache()
      await expect(run2.load(CB.location)).to.be.rejectedWith('Cannot load untrusted code')
      await expect(run2.load(CA.location)).to.be.rejectedWith('Cannot load untrusted code')
    })

    // ------------------------------------------------------------------------

    it('trusts code references if trusted', async () => {
      const run = new Run()
      class A extends Jig { static f (B) { this.B = B } }
      class B { }
      run.deploy(A)
      run.deploy(B)
      A.f(B)
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(A.location.slice(0, 64))
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('throws if load dependency of untrusted transaction', async () => {
      const run = new Run()
      class A extends Jig { }
      run.deploy(A)
      const a = new A()
      await a.sync()
      const run2 = new Run({ trust: [], cache: new Run.plugins.LocalCache() })
      await expect(run2.load(a.location)).to.be.rejectedWith('Cannot load untrusted code via replay')
    })
  })

  // --------------------------------------------------------------------------
  // Trust all
  // --------------------------------------------------------------------------

  describe('Trust All Code', () => {
    it('imports when trust all', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: '*' })
      const rawtx = await run.blockchain.fetch(A.location.slice(0, 64))
      await run2.import(rawtx)
    })

    // ------------------------------------------------------------------------

    it('loads via replay when trust all', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: ['*'] })
      run2.cache = new LocalCache()
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('loads via state when trust all', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust('*')
      await run2.load(A.location)
    })
  })

  // --------------------------------------------------------------------------
  // Untrusted
  // --------------------------------------------------------------------------

  describe('Untrusted Code', () => {
    it('throws if untrusted import', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      const rawtx = await run.blockchain.fetch(A.location.slice(0, 64))
      await expect(run2.import(rawtx)).to.be.rejectedWith('Cannot load untrusted code via replay')
    })

    // ------------------------------------------------------------------------

    it('throws if untrusted load via replay', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.cache = new LocalCache()
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code via replay')
    })

    // ------------------------------------------------------------------------

    it('throws if untrusted load via state', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      const run2 = new Run({ trust: [] })
      await expect(run2.load(A.location)).to.be.rejectedWith('Cannot load untrusted code via state')
    })

    // ------------------------------------------------------------------------

    it('throws if untrusted load with trusted origin with via replay', async () => {
      const run = new Run()
      class A extends Jig { }
      class B extends Jig { }
      const C = run.deploy(A)
      C.upgrade(B)
      await run.sync()
      const run2 = new Run({ trust: [] })
      run2.trust(C.origin.slice(0, 64))
      run2.cache = new LocalCache()
      await expect(run2.load(C.location)).to.be.rejectedWith('Cannot load untrusted code via replay')
    })
  })

  // --------------------------------------------------------------------------
  // Misc
  // --------------------------------------------------------------------------

  describe('Misc', () => {
    it('load untrusted with trust option', async () => {
      const run = new Run({ trust: [] })
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      await run.load(A.location)
      const run2 = new Run({ trust: [] })
      await run2.load(A.location, { trust: true })
      await run2.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('import untrusted with trust option', async () => {
      const run = new Run({ trust: [] })
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      await run.load(A.location)
      const run2 = new Run({ trust: [] })
      const rawtx = await run.blockchain.fetch(A.location.slice(0, 64))
      await run2.import(rawtx, { trust: true })
      await run2.import(rawtx)
    })

    // ------------------------------------------------------------------------

    it('deploy trusts', async () => {
      const run = new Run({ trust: [] })
      const A = run.deploy(class A extends Jig { })
      await run.sync()
      await run.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('upgrade trusts', async () => {
      const run = new Run({ trust: [] })
      const A = run.deploy(class A extends Jig { })
      A.upgrade(class B extends Jig { })
      await run.sync()
      await run.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('trusted code copies to new run instance', async () => {
      const run = new Run({ trust: [] })
      const A = run.deploy(class A extends Jig { })
      A.upgrade(class B extends Jig { })
      await run.sync()
      const run2 = new Run()
      await run2.load(A.location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
