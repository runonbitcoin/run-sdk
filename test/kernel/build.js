/**
 * build.js
 *
 * Tests that check properties of the transactions Run builds
 */

const { describe, it, afterEach } = require('mocha')
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { createTestExtrasRun } = require('../env/misc')
const { Jig, Berry } = Run
const { asm } = Run.extra
const { _calculateDust } = unmangle(unmangle(Run)._bsv)

// ------------------------------------------------------------------------------------------------
// Build
// ------------------------------------------------------------------------------------------------

describe('Build', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // scripts
  // --------------------------------------------------------------------------

  describe('scripts', () => {
    it('p2pkh scripts for address owners', async () => {
      const run = new Run()
      const address1 = run.owner.address
      const address2 = new bsv.PrivateKey().toAddress().toString()
      const tx = new Run.Transaction()
      class A extends Jig { init (owner) { this.owner = owner } }
      tx.update(() => new A(address2))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const hash1 = new bsv.Address(address1).hashBuffer.toString('hex')
      const hash2 = new bsv.Address(address2).hashBuffer.toString('hex')
      const asm1 = `OP_DUP OP_HASH160 ${hash1} OP_EQUALVERIFY OP_CHECKSIG`
      const asm2 = `OP_DUP OP_HASH160 ${hash2} OP_EQUALVERIFY OP_CHECKSIG`
      expect(bsvtx.outputs[1].script.toHex()).to.equal(bsv.Script.fromASM(asm1).toHex())
      expect(bsvtx.outputs[2].script.toHex()).to.equal(bsv.Script.fromASM(asm2).toHex())
    })

    // ------------------------------------------------------------------------

    it('p2pkh scripts for pubkey owners', async () => {
      new Run() // eslint-disable-line
      const pubkey = new bsv.PrivateKey().publicKey.toString()
      const tx = new Run.Transaction()
      class A extends Jig { send (owner) { this.owner = owner } }
      const a = new A()
      await a.sync()
      tx.update(() => a.send(pubkey))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const hash = new bsv.PublicKey(pubkey).toAddress().hashBuffer.toString('hex')
      const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
      expect(bsvtx.outputs[1].script.toHex()).to.equal(bsv.Script.fromASM(asm).toHex())
    })

    // ------------------------------------------------------------------------

    it('custom scripts for custom locks', async () => {
      const run = await createTestExtrasRun()
      class A extends Jig { static send (owner) { this.owner = owner } }
      class L {
        script () { return asm('OP_1 abcd') }
        domain () { return 100 }
      }
      L.deps = { asm: Run.extra.test.asm }
      const CA = run.deploy(A)
      await CA.sync()
      const tx = new Run.Transaction()
      tx.update(() => CA.send(new L()))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[1].script.toHex()).to.equal(bsv.Script.fromASM('OP_1 abcd').toHex())
    })
  })

  // --------------------------------------------------------------------------
  // satoshis
  // --------------------------------------------------------------------------

  describe('satoshis', () => {
    it('output satoshis are correct for default 0', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      class A extends Jig { }
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const dust = _calculateDust(bsvtx.outputs[1].script.toBuffer().length, bsv.Transaction.FEE_PER_KB)
      expect(bsvtx.outputs[1].satoshis).to.equal(dust)
    })

    // ------------------------------------------------------------------------

    it('output satoshis are correct for below dust', async () => {
      new Run() // eslint-disable-line
      const tx = new Run.Transaction()
      class A extends Jig { init (satoshis) { this.satoshis = satoshis } }
      tx.update(() => new A(0))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const dust = _calculateDust(bsvtx.outputs[1].script.toBuffer().length, bsv.Transaction.FEE_PER_KB)
      expect(bsvtx.outputs[2].satoshis).to.equal(dust)
    })

    // ------------------------------------------------------------------------

    it('output satoshis are correct for above dust', async () => {
      new Run() // eslint-disable-line
      const tx = new Run.Transaction()
      class A extends Jig { init (satoshis) { this.satoshis = satoshis } }
      tx.update(() => new A(5000))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[2].satoshis).to.equal(5000)
    })
  })

  // --------------------------------------------------------------------------
  // custom base
  // --------------------------------------------------------------------------

  describe('custom base', () => {
    it('output scripts are correct', async () => {
      const run = new Run()
      class A extends Jig { init (owner) { this.owner = owner } }
      run.deploy(A)
      await run.sync()
      const base = new bsv.Transaction()
      base.to(new bsv.PrivateKey().toAddress(), 100)
      base.to(new bsv.PrivateKey().toAddress(), 200)
      const tx = new Run.Transaction()
      tx.base = base.toString('hex')
      const address1 = new bsv.PrivateKey().toAddress().toString()
      const address2 = new bsv.PrivateKey().toAddress().toString()
      tx.update(() => new A(address1))
      tx.update(() => new A(address2))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const hash1 = new bsv.Address(address1).hashBuffer.toString('hex')
      const hash2 = new bsv.Address(address2).hashBuffer.toString('hex')
      const asm1 = `OP_DUP OP_HASH160 ${hash1} OP_EQUALVERIFY OP_CHECKSIG`
      const asm2 = `OP_DUP OP_HASH160 ${hash2} OP_EQUALVERIFY OP_CHECKSIG`
      expect(bsvtx.outputs[3].script.toHex()).to.equal(bsv.Script.fromASM(asm1).toHex())
      expect(bsvtx.outputs[4].script.toHex()).to.equal(bsv.Script.fromASM(asm2).toHex())
    })

    // ------------------------------------------------------------------------

    it('output satoshis are correct', async () => {
      const run = new Run()
      class A extends Jig { init (sats) { this.satoshis = sats } }
      run.deploy(A)
      await run.sync()
      const base = new bsv.Transaction()
      base.to(new bsv.PrivateKey().toAddress(), 100)
      base.to(new bsv.PrivateKey().toAddress(), 200)
      const tx = new Run.Transaction()
      tx.base = base.toString('hex')
      tx.update(() => new A(0))
      tx.update(() => new A(20))
      tx.update(() => new A(2000))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const dust = _calculateDust(bsvtx.outputs[3].script.toBuffer().length, bsv.Transaction.FEE_PER_KB)
      expect(bsvtx.outputs[3].satoshis).to.equal(dust)
      expect(bsvtx.outputs[4].satoshis).to.equal(20)
      expect(bsvtx.outputs[5].satoshis).to.equal(2000)
    })
  })

  // --------------------------------------------------------------------------
  // app name
  // --------------------------------------------------------------------------

  describe('app name', () => {
    it('utf8 app name is correctly set', async () => {
      const run = new Run()
      run.app = 'abc 😊 !'
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A {}))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[0].script.chunks[4].buf.toString('utf8')).to.equal(run.app)
    })

    // ------------------------------------------------------------------------

    it('empty app name is correctly set', async () => {
      const run = new Run()
      run.app = ''
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A {}))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[0].script.chunks.length).to.equal(6)
      expect(bsvtx.outputs[0].script.chunks[4].opcodenum).to.equal(0)
    })
  })

  // --------------------------------------------------------------------------
  // prefix
  // --------------------------------------------------------------------------

  describe('prefix', () => {
    it('has run tag', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A {}))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[0].script.chunks[2].buf.toString('utf8')).to.equal('run')
    })

    // ------------------------------------------------------------------------

    it('has version', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A {}))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[0].script.chunks[3].buf.toString('hex')).to.equal('05')
    })
  })

  // --------------------------------------------------------------------------
  // metadata
  // --------------------------------------------------------------------------

  describe('metadata', () => {
    it('deploy', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(class A { }))
      const rawtx = await tx.export()
      await tx.cache()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const state = {
        kind: 'code',
        props: {
          deps: {},
          location: '_o1',
          nonce: 1,
          origin: '_o1',
          owner: run.owner.address,
          satoshis: 0
        },
        src: 'class A { }',
        version: '04'
      }
      const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
      const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 0,
        ref: [],
        out: [stateHash],
        del: [],
        cre: [run.owner.address],
        exec: [{ op: 'DEPLOY', data: ['class A { }', { deps: { } }] }]
      })
    })

    // ------------------------------------------------------------------------

    it('new jig from class ref', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      class A extends Jig { }
      run.deploy(A)
      await run.sync()
      tx.update(() => new A())
      const rawtx = await tx.export()
      await tx.cache()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const state = {
        cls: { $jig: A.location },
        kind: 'jig',
        props: {
          location: '_o1',
          nonce: 1,
          origin: '_o1',
          owner: run.owner.address,
          satoshis: 0
        },
        version: '04'
      }
      const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
      const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 0,
        ref: [A.location],
        out: [stateHash],
        del: [],
        cre: [run.owner.address],
        exec: [{ op: 'NEW', data: [{ $jig: 0 }, []] }]
      })
    })

    // ------------------------------------------------------------------------

    it('call method with berry ref', async () => {
      const run = new Run()
      class B extends Berry { static async pluck () { return new B() } }
      run.deploy(B)
      await run.sync()
      const b = await B.load('123')
      class A { }
      A.b = b
      const tx = new Run.Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const state = {
        kind: 'code',
        props: {
          b: { $jig: b.location },
          deps: {},
          location: '_o1',
          nonce: 1,
          origin: '_o1',
          owner: run.owner.address,
          satoshis: 0
        },
        src: 'class A { }',
        version: '04'
      }
      const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
      const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 0,
        ref: [b.location],
        out: [stateHash],
        del: [],
        cre: [run.owner.address],
        exec: [{ op: 'DEPLOY', data: ['class A { }', { b: { $jig: 0 }, deps: { } }] }]
      })
    })

    // ------------------------------------------------------------------------

    it('destroy code', async () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      await run.sync()
      const tx = new Run.Transaction()
      tx.update(() => CA.destroy())
      const rawtx = await tx.export()
      await tx.cache()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const state = {
        kind: 'code',
        props: {
          deps: {},
          location: '_d0',
          nonce: 2,
          origin: CA.origin,
          owner: null,
          satoshis: 0
        },
        src: 'class A { }',
        version: '04'
      }
      const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
      const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 1,
        ref: [],
        out: [],
        del: [stateHash],
        cre: [],
        exec: [{ op: 'CALL', data: [{ $jig: 0 }, 'destroy', []] }]
      })
    })

    // ------------------------------------------------------------------------

    it('auth jig', async () => {
      const run = new Run()
      const tx = new Run.Transaction()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      tx.update(() => a.auth())
      const rawtx = await tx.export()
      await tx.cache()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const state = {
        cls: { $jig: A.location },
        kind: 'jig',
        props: {
          location: '_o1',
          nonce: 2,
          origin: a.origin,
          owner: run.owner.address,
          satoshis: 0
        },
        version: '04'
      }
      const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
      const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 1,
        ref: [],
        out: [stateHash],
        del: [],
        cre: [],
        exec: [{ op: 'CALL', data: [{ $jig: 0 }, 'auth', []] }]
      })
    })

    // ------------------------------------------------------------------------

    it('multiple actions', async () => {
      const run = new Run()
      class A extends Jig { }
      class B extends Jig { }
      const CA = run.deploy(A)
      const a = new A()
      await run.sync()
      const tx = new Run.Transaction()
      tx.update(() => new A())
      tx.update(() => run.deploy(B))
      tx.update(() => a.auth())
      tx.update(() => CA.destroy())
      const rawtx = await tx.export()
      await tx.cache()
      const bsvtx = new bsv.Transaction(rawtx)
      const metadataString = bsvtx.outputs[0].script.chunks[5].buf.toString('utf8')
      const metadata = JSON.parse(metadataString)
      const a1State = {
        cls: { $jig: '_d0' },
        kind: 'jig',
        props: {
          location: '_o1',
          nonce: 2,
          origin: a.origin,
          owner: run.owner.address,
          satoshis: 0
        },
        version: '04'
      }
      const a1StateBuffer = bsv.deps.Buffer.from(JSON.stringify(a1State), 'utf8')
      const a1StateHash = bsv.crypto.Hash.sha256(a1StateBuffer).toString('hex')
      const a2State = {
        cls: { $jig: '_d0' },
        kind: 'jig',
        props: {
          location: '_o2',
          nonce: 1,
          origin: '_o2',
          owner: run.owner.address,
          satoshis: 0
        },
        version: '04'
      }
      const a2StateBuffer = bsv.deps.Buffer.from(JSON.stringify(a2State), 'utf8')
      const a2StateHash = bsv.crypto.Hash.sha256(a2StateBuffer).toString('hex')
      const BState = {
        kind: 'code',
        props: {
          deps: { Jig: { $jig: 'native://Jig' } },
          location: '_o3',
          nonce: 1,
          origin: '_o3',
          owner: run.owner.address,
          satoshis: 0
        },
        src: 'class B extends Jig { }',
        version: '04'
      }
      const BStateBuffer = bsv.deps.Buffer.from(JSON.stringify(BState), 'utf8')
      const BStateHash = bsv.crypto.Hash.sha256(BStateBuffer).toString('hex')
      const AState = {
        kind: 'code',
        props: {
          deps: { Jig: { $jig: 'native://Jig' } },
          location: '_d0',
          nonce: 2,
          origin: CA.origin,
          owner: null,
          satoshis: 0
        },
        src: 'class A extends Jig { }',
        version: '04'
      }
      const AStateBuffer = bsv.deps.Buffer.from(JSON.stringify(AState), 'utf8')
      const AStateHash = bsv.crypto.Hash.sha256(AStateBuffer).toString('hex')
      expect(metadata).to.deep.equal({
        in: 2,
        ref: ['native://Jig'],
        out: [
          a1StateHash,
          a2StateHash,
          BStateHash
        ],
        del: [AStateHash],
        cre: [run.owner.address, run.owner.address],
        exec: [
          { op: 'NEW', data: [{ $jig: 1 }, []] },
          { op: 'DEPLOY', data: ['class B extends Jig { }', { deps: { Jig: { $jig: 2 } } }] },
          { op: 'CALL', data: [{ $jig: 0 }, 'auth', []] },
          { op: 'CALL', data: [{ $jig: 1 }, 'destroy', []] }
        ]
      })
    })
  })
})

// ------------------------------------------------------------------------------------------------
