/**
 * metadata.js
 *
 * Tests for lib/kernel/metadata.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const { Jig, Berry } = Run

// ------------------------------------------------------------------------------------------------
// metadata
// ------------------------------------------------------------------------------------------------

describe('metadata', () => {
  it('basic deploy', async () => {
    const run = new Run({ app: 'TestApp' })
    class A extends Jig { }
    run.deploy(A)
    await run.sync()
    const txid = A.location.slice(0, 64)
    const rawtx = await run.blockchain.fetch(txid)
    const metadata = Run.util.metadata(rawtx)

    const exec = [{ op: 'DEPLOY', data: [A.toString(), { deps: { Jig: { $jig: 0 } } }] }]
    expect(typeof metadata).to.equal('object')
    expect(metadata.version).to.equal(Run.protocol)
    expect(metadata.app).to.equal('TestApp')
    expect(metadata.in).to.equal(0)
    expect(metadata.ref).to.deep.equal(['native://Jig'])
    expect(metadata.out.length).to.equal(1)
    expect(metadata.del.length).to.equal(0)
    expect(metadata.cre).to.deep.equal([run.owner.address])
    expect(metadata.exec).to.deep.equal(exec)
  })

  // ------------------------------------------------------------------------

  it('empty run transaction', () => {
    const metadata = { in: 0, ref: [], out: [], del: [], cre: [], exec: [] }
    const Buffer = bsv.deps.Buffer
    const prefix = Buffer.from('run', 'utf8')
    const ver = Buffer.from([0x05])
    const app = Buffer.from('', 'utf8')
    const json = Buffer.from(JSON.stringify(metadata), 'utf8')
    const script = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
    const output = new bsv.Transaction.Output({ script, satoshis: 0 })
    const rawtx = new bsv.Transaction().addOutput(output).toString()
    expect(() => Run.util.metadata(rawtx)).not.to.throw()
  })

  // ------------------------------------------------------------------------

  it('throws if invalid rawtx', () => {
    expect(() => Run.util.metadata()).to.throw('Invalid transaction')
    expect(() => Run.util.metadata(null)).to.throw('Invalid transaction')
    expect(() => Run.util.metadata('')).to.throw('Invalid transaction')
    expect(() => Run.util.metadata(new bsv.Transaction())).to.throw('Invalid transaction')
  })

  // ------------------------------------------------------------------------

  it('throws if other op_return protocol', () => {
    const error = 'Not a RUN transaction: invalid OP_RETURN protocol'
    expect(() => Run.util.metadata(new bsv.Transaction().toString())).to.throw(error)
    expect(() => Run.util.metadata(new bsv.Transaction().addSafeData('run').toString())).to.throw(error)
    expect(() => Run.util.metadata(new bsv.Transaction().addSafeData('b').toString())).to.throw(error)
    expect(() => Run.util.metadata(new bsv.Transaction().to(new bsv.PrivateKey().toAddress(), 100).toString())).to.throw(error)
  })

  // ------------------------------------------------------------------------

  it('throws if not op_false op_return', () => {
    const error = 'Not a RUN transaction: invalid OP_RETURN protocol'
    const metadata = { in: 0, ref: [], out: [], del: [], cre: [], exec: [] }
    const Buffer = bsv.deps.Buffer
    const prefix = Buffer.from('run', 'utf8')
    const ver = Buffer.from([0x05])
    const app = Buffer.from('', 'utf8')
    const json = Buffer.from(JSON.stringify(metadata), 'utf8')
    const script = bsv.Script.buildDataOut([prefix, ver, app, json])
    const output = new bsv.Transaction.Output({ script, satoshis: 0 })
    const rawtx = new bsv.Transaction().addOutput(output).toString()
    expect(() => Run.util.metadata(rawtx)).to.throw(error)
  })

  // ------------------------------------------------------------------------

  it('throws if invalid prefix', () => {
    const error = 'Not a RUN transaction: invalid OP_RETURN protocol'
    const metadata = { in: 0, ref: [], out: [], del: [], cre: [], exec: [] }
    const Buffer = bsv.deps.Buffer
    const prefix = Buffer.from('run2', 'utf8')
    const ver = Buffer.from([0x05])
    const app = Buffer.from('', 'utf8')
    const json = Buffer.from(JSON.stringify(metadata), 'utf8')
    const script = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
    const output = new bsv.Transaction.Output({ script, satoshis: 0 })
    const rawtx = new bsv.Transaction().addOutput(output).toString()
    expect(() => Run.util.metadata(rawtx)).to.throw(error)
  })

  // ------------------------------------------------------------------------

  it('throws if invalid del metadata', () => {
    const error = 'Not a RUN transaction: invalid RUN metadata'
    const metadata = { in: 0, ref: [], out: [], del: [null], cre: [], exec: [] }
    const Buffer = bsv.deps.Buffer
    const prefix = Buffer.from('run', 'utf8')
    const ver = Buffer.from([0x05])
    const app = Buffer.from('', 'utf8')
    const json = Buffer.from(JSON.stringify(metadata), 'utf8')
    const script = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
    const output = new bsv.Transaction.Output({ script, satoshis: 0 })
    const rawtx = new bsv.Transaction().addOutput(output).toString()
    expect(() => Run.util.metadata(rawtx)).to.throw(error)
  })

  // ------------------------------------------------------------------------

  it('throws if extra version metadata', () => {
    const error = 'Not a RUN transaction: invalid RUN metadata'
    const metadata = { version: '06', in: 0, ref: [], out: [], del: [], cre: [], exec: [] }
    const Buffer = bsv.deps.Buffer
    const prefix = Buffer.from('run', 'utf8')
    const ver = Buffer.from([0x05])
    const app = Buffer.from('', 'utf8')
    const json = Buffer.from(JSON.stringify(metadata), 'utf8')
    const script = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
    const output = new bsv.Transaction.Output({ script, satoshis: 0 })
    const rawtx = new bsv.Transaction().addOutput(output).toString()
    expect(() => Run.util.metadata(rawtx)).to.throw(error)
  })
})

// ------------------------------------------------------------------------------------------------
// deps
// ------------------------------------------------------------------------------------------------

describe('deps', () => {
  it('returns jig inputs', async () => {
    const run = new Run()
    class A { }
    const CA = run.deploy(A)
    CA.destroy()
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([CA.origin.slice(0, 64)])
  })

  // --------------------------------------------------------------------------

  it('returns referenced jig transactions', async () => {
    const run = new Run()
    class A extends Jig { }
    const CA = run.deploy(A)
    const a = new A()
    await run.sync()
    const rawtx = await run.blockchain.fetch(a.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([CA.origin.slice(0, 64)])
  })

  // --------------------------------------------------------------------------

  it('returns referenced berry txids', async () => {
    const run = new Run()
    class B extends Berry { }
    run.deploy(B)
    await run.sync()
    const berryTxid = '0000000000000000000000000000000000000000000000000000000000000000'
    const b = await B.load(berryTxid)
    class A { }
    A.b = b
    const CA = run.deploy(A)
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([B.location.slice(0, 64), berryTxid])
  })

  // --------------------------------------------------------------------------

  it('returns referenced berry objects with txids', async () => {
    const run = new Run()
    class B extends Berry { static async loadWithMetadata (data) { return this.load(JSON.stringify(data)) } }
    run.deploy(B)
    await run.sync()
    const berryTxid = '0000000000000000000000000000000000000000000000000000000000000000'
    const b = await B.loadWithMetadata({ txid: berryTxid, data: 'abc' })
    class A { }
    A.b = b
    const CA = run.deploy(A)
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([B.location.slice(0, 64), berryTxid])
  })

  // --------------------------------------------------------------------------

  it('does not return payment inputs', async () => {
    const run = new Run()
    class A { }
    const CA = run.deploy(A)
    CA.auth()
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(new bsv.Transaction(rawtx).inputs.length > 1).to.equal(true)
    expect(Run.util.deps(rawtx).length).to.equal(1)
  })

  // --------------------------------------------------------------------------

  it('does not return duplicate txids', async () => {
    const run = new Run()
    const [CA, CB] = run.transaction(() => {
      return [run.deploy(class A {}), run.deploy(class B {})]
    })
    await run.sync()
    expect(CA.location.slice(0, 64)).to.equal(CB.location.slice(0, 64))
    class C {}
    C.A = CA
    C.B = CB
    const CC = run.deploy(C)
    await run.sync()
    const rawtx = await run.blockchain.fetch(CC.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([CA.location.slice(0, 64)])
  })

  // --------------------------------------------------------------------------

  it('does not return berry paths if not txids', async () => {
    const run = new Run()
    class B extends Berry { }
    run.deploy(B)
    await run.sync()
    const b = await B.load('abc')
    class A { }
    A.b = b
    const CA = run.deploy(A)
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([B.location.slice(0, 64)])
  })

  // --------------------------------------------------------------------------

  it('does not return native:// references', async () => {
    const run = new Run()
    class A extends Jig { }
    const CA = run.deploy(A)
    await CA.sync()
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([])
  })

  // --------------------------------------------------------------------------

  it('supports metadata in not first output', async () => {
    const run = new Run()
    const tx = new Run.Transaction()
    tx.base = new bsv.Transaction().addSafeData('123').toString()
    const CA = tx.update(() => run.deploy(class A {}))
    await tx.publish()
    expect(CA.location.endsWith('_o2')).to.equal(true)
    const rawtx = await run.blockchain.fetch(CA.location.slice(0, 64))
    expect(Run.util.deps(rawtx)).to.deep.equal([])
  })

  // --------------------------------------------------------------------------

  it('throws if not a RUN transaction', () => {
    expect(() => Run.util.deps(new bsv.Transaction().toString())).to.throw('Not a RUN transaction')
  })
})

// ------------------------------------------------------------------------------------------------
