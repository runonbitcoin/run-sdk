/**
 * viewer.js
 *
 * Tests for lib/plugins/viewer.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const { PrivateKey, Transaction } = require('bsv')
const Run = require('../env/run')
const { Jig } = Run
const { Viewer, OwnerWrapper } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Viewer
// ------------------------------------------------------------------------------------------------

describe('Viewer', () => {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is OwnerWrapper', () => {
      const address = new PrivateKey().toAddress().toString()
      expect(new Viewer(address) instanceof OwnerWrapper).to.equal(true)
    })

    // --------------------------------------------------------------------------------------------

    it('address owners', () => {
      const address = new PrivateKey().toAddress().toString()
      const viewer = new Viewer(address)
      expect(viewer.owner).to.equal(address)
    })

    // ------------------------------------------------------------------------

    it('pubkey owners', () => {
      const pubkey = new PrivateKey().publicKey.toString()
      const viewer = new Viewer(pubkey)
      expect(viewer.owner).to.equal(pubkey)
    })

    // ------------------------------------------------------------------------

    it('lock object owners', () => {
      class CustomLock {
        script () { return '010203' }
        domain () { return 1 }
      }
      const lock = new CustomLock()
      const viewer = new Viewer(lock)
      expect(viewer.owner).to.deep.equal(lock)
    })

    // ------------------------------------------------------------------------

    it('throws if owner is invalid', () => {
      expect(() => new Viewer()).to.throw('Invalid owner: undefined')
      expect(() => new Viewer(null)).to.throw('Invalid owner: null')
      expect(() => new Viewer(new (class {})())).to.throw('Invalid owner: [anonymous object]')
    })
  })

  // --------------------------------------------------------------------------
  // nextOwner
  // --------------------------------------------------------------------------

  describe('nextOwner', () => {
    it('always returns the lock', async () => {
      class CustomLock {
        script () { return '010203' }
        domain () { return 1 }
      }
      const lock = new CustomLock()
      const viewer = new Viewer(lock)
      expect(await viewer.nextOwner()).to.equal(lock)
    })
  })

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  describe('sign', () => {
    it('does not sign', async () => {
      const address = new PrivateKey().toAddress().toString()
      const viewer = new Viewer(address)
      const tx = new Transaction()
      const hashBefore = tx.hash
      expect(await viewer.sign(tx.toString())).to.equal(tx.toString())
      expect(tx.hash).to.equal(hashBefore)
    })
  })

  // --------------------------------------------------------------------------
  // misc
  // --------------------------------------------------------------------------

  describe('misc', () => {
    it('deploy to viewer', async () => {
      const run = new Run()
      run.owner = new PrivateKey().toAddress().toString()
      expect(run.owner instanceof Viewer).to.equal(true)
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
    })
  })
})

// ------------------------------------------------------------------------------------------------
