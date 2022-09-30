/**
 * editor.js
 *
 * Tests for lib/kernel/editor.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { Code, Jig, Berry } = Run
const unmangle = require('../env/unmangle')
const { _sudo } = unmangle(Run)

// ------------------------------------------------------------------------------------------------
// Editor
// ------------------------------------------------------------------------------------------------

describe('Editor', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Activate
  // --------------------------------------------------------------------------

  describe('activate', () => {
    it('deactivate removes bindings', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      await run.sync()
      run.deactivate()
      expect(typeof A.location).to.equal('undefined')
      expect(typeof A.origin).to.equal('undefined')
      expect(typeof A.nonce).to.equal('undefined')
      expect(typeof A.owner).to.equal('undefined')
      expect(typeof A.satoshis).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('activate adds bindings', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      await run.sync()
      const location = A.location
      const origin = A.origin
      const nonce = A.nonce
      const owner = A.owner
      const satoshis = A.satoshis
      run.deactivate()
      run.activate()
      expect(A.location).to.equal(location)
      expect(A.origin).to.equal(origin)
      expect(A.nonce).to.equal(nonce)
      expect(A.owner).to.equal(owner)
      expect(A.satoshis).to.equal(satoshis)
    })

    // ------------------------------------------------------------------------

    it('should support changing networks', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      await run.sync()
      const blockchain = new Run.plugins.Mockchain()
      blockchain.network = 'test'
      const run2 = new Run({ blockchain })
      run2.activate()
      expect(A.location).to.equal(undefined)
      run.activate()
      expect(A.location).not.to.equal(undefined)
    })

    // ------------------------------------------------------------------------

    it('sets correct bindings for network', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      await run.sync()
      const mockLocation = A.location
      const mockOwner = A.owner
      const blockchain = new Run.plugins.Mockchain()
      blockchain.network = 'test'
      const run2 = new Run({ blockchain })
      run2.activate()
      run2.deploy(A)
      const testLocation = A.location
      const testOwner = A.owner
      expect(A.location).to.equal(testLocation)
      expect(A.owner).to.equal(testOwner)
      run.activate()
      expect(A.location).to.equal(mockLocation)
      expect(A.owner).to.equal(mockOwner)
    })
  })

  // --------------------------------------------------------------------------
  // Preinstall
  // --------------------------------------------------------------------------

  describe('Preinstall', () => {
    it('creates code without bindings', () => {
      const C = Run.util.install(class A { })
      expect(C instanceof Code).to.equal(true)
      _sudo(() => {
        expect(C.location).to.equal(undefined)
        expect(C.origin).to.equal(undefined)
        expect(C.nonce).to.equal(undefined)
        expect(C.owner).to.equal(undefined)
        expect(C.satoshis).to.equal(undefined)
      })
    })

    // ------------------------------------------------------------------------

    it('throws if read bindings', () => {
      const C = Run.util.install(class A { })
      expect(() => C.location).to.throw('Cannot read location')
      expect(() => C.origin).to.throw('Cannot read origin')
      expect(() => C.nonce).to.throw('Cannot read nonce')
      expect(() => C.owner).to.throw('Cannot read owner')
      expect(() => C.satoshis).to.throw('Cannot read satoshis')
    })

    // ------------------------------------------------------------------------

    it('only preinstalls once', () => {
      class A { }
      const C1 = Run.util.install(A)
      const C2 = Run.util.install(A)
      expect(C1).to.equal(C2)
    })

    // ------------------------------------------------------------------------

    it('create jigs using preinstalled code', async () => {
      class A extends Jig { }
      const CA = Run.util.install(A)
      new Run() // eslint-disable-line
      const a = new CA()
      await a.sync()
      expect(typeof A.location).to.equal('string')
      expect(typeof CA.location).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('pass as args preinstalled code', async () => {
      class A extends Jig { }
      const CA = Run.util.install(A)
      new Run() // eslint-disable-line
      class B extends Jig { init (A) { this.A = A } }
      const b = new B(CA)
      await b.sync()
      expect(typeof A.location).to.equal('string')
      expect(typeof CA.location).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('use preinstalled code as code props', async () => {
      class A extends Jig { }
      const CA = Run.util.install(A)
      const run = new Run()
      class B {}
      B.A = CA
      const CB = await run.deploy(B)
      await CB.sync()
      expect(typeof A.location).to.equal('string')
      expect(typeof CA.location).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('locks onto network once used', async () => {
      class A extends Jig { }
      const CA = Run.util.install(A)
      const run = new Run()
      run.deploy(CA)
      await run.sync()
      const location = CA.location
      run.deactivate()
      expect(CA.location).to.equal(location)
    })
  })

  // --------------------------------------------------------------------------
  // uninstall
  // --------------------------------------------------------------------------

  describe('uninstall', () => {
    it('remove bindings and presets from local', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      await C.sync()
      Run.util.uninstall(A)
      expect('presets' in A).to.equal(false)
      expect('location' in A).to.equal(false)
      expect('origin' in A).to.equal(false)
      expect('nonce' in A).to.equal(false)
      expect('owner' in A).to.equal(false)
      expect('satoshis' in A).to.equal(false)
      expect('location' in C).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('can be deployed again', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      Run.util.uninstall(C)
      const D = run.deploy(A)
      await run.sync()
      expect(C.location).not.to.equal(D.location)
    })

    // ------------------------------------------------------------------------

    it('can use uninstalled code', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      const C = run.deploy(A)
      Run.util.uninstall(A)
      C.auth()
      C.f()
      C.destroy()
      new C() // eslint-disable-line
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('throws for native code', () => {
      expect(() => Run.util.uninstall(Jig)).to.throw('Cannot uninstall native code')
      expect(() => Run.util.uninstall(Berry)).to.throw('Cannot uninstall native code')
    })

    // ------------------------------------------------------------------------

    it('reinstall with presets', async () => {
      const run = new Run()
      class A { }
      const A2 = run.deploy(A)
      await run.sync()
      const location = A.location

      const presets = A.presets
      Run.util.uninstall(A)
      expect(A.location).to.equal(undefined)
      A.presets = presets
      const A3 = run.deploy(A)
      await run.sync()

      expect(A2).not.to.equal(A3)
      expect(A.location).to.equal(location)
      expect(A3.location).to.equal(location)
    })
  })
})

// ------------------------------------------------------------------------------------------------
