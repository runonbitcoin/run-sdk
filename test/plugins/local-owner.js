/**
 * local-owner.js
 *
 * Tests for lib/plugins/local-owner.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const bsv = require('bsv')
const { Address, PrivateKey, PublicKey, Transaction } = bsv
const { COVER } = require('../env/config')
const { createTestExtrasRun } = require('../env/misc')
const Run = require('../env/run')
const { Jig } = Run
const { Group } = Run.extra.test
const { CommonLock } = Run.util
const { LocalOwner, Mockchain, OwnerWrapper } = Run.plugins
const unmangle = require('../env/unmangle')
const { _getSignedPubkeys } = unmangle(LocalOwner)

// ------------------------------------------------------------------------------------------------
// LocalOwner
// ------------------------------------------------------------------------------------------------

describe('LocalOwner', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('is OwnerWrapper', () => {
      expect(new LocalOwner() instanceof OwnerWrapper).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('create and set properties', () => {
      const privateKey = new PrivateKey('testnet')
      const owner = new LocalOwner(privateKey)

      expect(owner.privkey).to.equal(privateKey.toString())
      expect(owner.bsvPrivateKey).to.equal(privateKey)
      expect(owner.bsvPrivateKey instanceof PrivateKey).to.equal(true)

      expect(owner.pubkey).to.equal(privateKey.publicKey.toString())
      expect(owner.bsvPublicKey instanceof PublicKey).to.equal(true)
      expect(owner.bsvPublicKey.toString()).to.equal(privateKey.publicKey.toString())

      expect(owner.address).to.equal(privateKey.toAddress().toString())
      expect(owner.bsvAddress instanceof Address).to.equal(true)
      expect(owner.bsvAddress.toString()).to.equal(privateKey.toAddress().toString())
    })

    // ------------------------------------------------------------------------

    it('private key strings', () => {
      const privateKey = new PrivateKey('mainnet')
      const owner = new LocalOwner(privateKey.toString())
      expect(owner.privkey).to.equal(privateKey.toString())
      expect(owner.pubkey).to.equal(privateKey.publicKey.toString())
      expect(owner.address).to.equal(privateKey.toAddress().toString())
    })

    // ------------------------------------------------------------------------

    it('generate random', () => {
      const owner1 = new LocalOwner()
      const owner2 = new LocalOwner()
      expect(typeof owner1.privkey).to.equal('string')
      expect(typeof owner2.privkey).to.equal('string')
      expect(owner1.privkey).not.to.equal(owner2.privkey)
    })

    // ------------------------------------------------------------------------

    it('throws if bad owner', () => {
      expect(() => new LocalOwner('123')).to.throw('Invalid private key: "123"')
      expect(() => new LocalOwner(new PrivateKey().publicKey)).to.throw('Invalid private key')
    })

    // ------------------------------------------------------------------------

    it('throws if wrong network', () => {
      const privateKey = new PrivateKey('mainnet')
      const blockchain = new Mockchain()
      expect(() => new LocalOwner(privateKey, blockchain.network)).to.throw('Private key network mismatch')
      expect(() => new LocalOwner(privateKey.toString(), blockchain.network)).to.throw('Private key network mismatch')
    })
  })

  // --------------------------------------------------------------------------
  // nextOwner
  // --------------------------------------------------------------------------

  describe('nextOwner', () => {
    it('returns the address', async () => {
      const privateKey = new PrivateKey()
      const owner = new LocalOwner(privateKey)
      expect(await owner.nextOwner()).to.equal(owner.address)
    })
  })

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  describe('sign', () => {
    it('signs with common lock', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { set () { this.n = 1 }}
      const a = new A()
      a.set()
      await a.sync()
      expect(a.owner instanceof CommonLock)
    })

    // ------------------------------------------------------------------------

    it('does not for different address', async () => {
      const run = new Run()
      const run2 = new Run()
      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      // Create a jig assigned to someone else
      run.activate()
      const a = new A(run2.owner.address)
      await a.sync()

      // Try signing and then export tx
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      const rawtx = await tx.export()
      tx.rollback()

      // Make sure our transaction is not fully signed
      const bsvtx = new Transaction(rawtx)
      expect(bsvtx.inputs[0].script.toBuffer().length).to.equal(0)
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith('mandatory-script-verify-flag-failed')

      // Sign with pubkey 2 and broadcast
      run2.activate()
      const tx2 = await run2.import(rawtx)
      await tx2.publish()
    })

    // ------------------------------------------------------------------------

    it('should sign P2PKH without locks', async () => {
      const run = new Run()
      class A extends Jig { set () { this.n = 1 }}
      const a = new A()
      await a.sync()
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      const rawtx = await tx.export()
      const prevrawtx = await run.blockchain.fetch(a.origin.slice(0, 64))
      const prevtx = new Transaction(prevrawtx)
      const signed = await run.owner.sign(rawtx, [prevtx.outputs[2]], [])
      expect(new Transaction(signed).inputs[0].script.toBuffer().length > 0).to.equal(true)
      tx.rollback()
    })
  })

  // --------------------------------------------------------------------------
  // Group lock
  // --------------------------------------------------------------------------

  describe('Group', () => {
    it('should sign 1-1 group lock', async () => {
      const run = await createTestExtrasRun()
      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }
      const a = new A(new Group([run.owner.pubkey], 1))
      a.set()
      await a.sync()
    })

    // ----------------------------------------------------------------------

    it('should sign 2-3 group lock using export and import', async () => {
      const run = await createTestExtrasRun()
      const run2 = await createTestExtrasRun()
      const run3 = await createTestExtrasRun()

      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      // Create a jig with a 2-3 group owner
      run.activate()
      const a = new A(new Group([run.owner.pubkey, run2.owner.pubkey, run3.owner.pubkey], 2))
      await a.sync()

      // Sign with pubkey 1 and export tx
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      await tx.pay()
      await tx.sign()
      const rawtx = await tx.export({ pay: false, sign: false })
      tx.rollback()

      // Sign with pubkey 2 and broadcast
      if (COVER) return
      run2.activate()
      const tx2 = await run2.import(rawtx)
      await tx2.sign()
      await tx2.publish()
    })

    // ----------------------------------------------------------------------

    it('should sign 2-3 group lock by changing owners', async () => {
      const run = await createTestExtrasRun()
      const run2 = await createTestExtrasRun()
      const run3 = await createTestExtrasRun()

      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      // Create a jig with a 2-3 group owner
      run.activate()
      const a = new A(new Group([run.owner.pubkey, run2.owner.pubkey, run3.owner.pubkey], 2))
      await a.sync()

      // Sign with pubkey 1 and export tx
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      await tx.pay()
      await tx.sign()
      run.owner = run2.owner
      await tx.sign()
      await tx.publish()
    })

    // ----------------------------------------------------------------------

    it('should not sign group lock if already signed', async () => {
      const run = await createTestExtrasRun()

      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      // Create a jig with a 2-3 group owner
      const a = new A(new Group([run.owner.pubkey], 1))
      await a.sync()

      // Sign with pubkey 1 and export tx
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      await tx.pay()

      // Sign more than once
      await tx.sign()
      await tx.sign()
      await tx.sign()

      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.inputs[0].script.chunks.length).to.equal(2)

      await tx.publish()
    })

    // ----------------------------------------------------------------------

    it('should not sign group lock if not our pubkey', async () => {
      const run = await createTestExtrasRun()
      const run2 = await createTestExtrasRun()

      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      // Create a jig with a 2-3 group owner
      run.activate()
      const a = new A(new Group([run2.owner.pubkey], 1))
      await a.sync()

      // Try signing and then export tx
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      await tx.pay()
      await tx.sign()
      const rawtx = await tx.export()
      tx.rollback()

      // Make sure our transaction is not fully signed
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith('mandatory-script-verify-flag-failed')

      // Sign with pubkey 2 and broadcast
      if (COVER) return
      run2.activate()
      const tx2 = await run2.import(rawtx)
      await tx2.publish()
    })

    // ----------------------------------------------------------------------

    it('sign out of order', async () => {
      const run = await createTestExtrasRun()

      const privkey1 = new bsv.PrivateKey()
      const privkey2 = new bsv.PrivateKey()
      const privkey3 = new bsv.PrivateKey()
      const bsvprivkeys = [privkey1, privkey2, privkey3]
      const bsvpubkeys = bsvprivkeys.map(privkey => privkey.toPublicKey())
      const pubkeys = bsvpubkeys.map(bsvpubkey => bsvpubkey.toString())

      class A extends Jig {
        init (owner) { this.owner = owner }
        set () { this.n = 1 }
      }

      const a = new A(new Group(pubkeys, 3))
      await a.sync()
      const tx = new Run.Transaction()
      tx.update(() => a.set())
      await tx.pay()
      run.owner = privkey2
      await tx.sign()
      run.owner = privkey3
      await tx.sign()
      run.owner = privkey1
      await tx.sign()
      const rawtx = await tx.export()

      const bsvtx = new bsv.Transaction(rawtx)
      const vin = 0
      const prevrawtx = await run.blockchain.fetch(bsvtx.inputs[vin].prevTxId.toString('hex'))
      const prevtx = new bsv.Transaction(prevrawtx)
      const prevout = prevtx.outputs[bsvtx.inputs[vin].outputIndex]

      const sig1 = bsvtx.inputs[0].script.chunks[1].buf.toString('hex')
      const sig2 = bsvtx.inputs[0].script.chunks[2].buf.toString('hex')
      const sig3 = bsvtx.inputs[0].script.chunks[3].buf.toString('hex')
      const sigs = [sig1, sig2, sig3]

      const signedPubkeys = await _getSignedPubkeys(bsvtx, vin, prevout, sigs, pubkeys)
      expect(signedPubkeys).to.deep.equal(pubkeys)
    })
  })
})

// ------------------------------------------------------------------------------------------------
