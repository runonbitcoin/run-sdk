/**
 * transaction.js
 *
 * Tests for lib/kernel/transaction.js
 */

const bsv = require('bsv')
const { PrivateKey } = bsv
const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { stub, fake } = require('sinon')
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry, Transaction } = Run
const { LocalCache, LocalPurse, LocalOwner } = Run.plugins
const { STRESS } = require('../env/config')

// ------------------------------------------------------------------------------------------------
// Transaction
// ------------------------------------------------------------------------------------------------

describe('Transaction', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // transaction
  // --------------------------------------------------------------------------

  describe('transaction', () => {
    it('deploy and create', async () => {
      const run = new Run()
      class A extends Jig { }
      const [a, b] = run.transaction(() => [new A(), new A()])
      await run.sync()
      function test (a, b) { expect(a.location.slice(0, 64)).to.equal(b.location.slice(0, 64)) }
      test(a, b)
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      test(a2, b2)
    })

    // ------------------------------------------------------------------------

    it('deploy and deploy child', async () => {
      const run = new Run()
      class A { }
      class B extends A { }
      const C = run.transaction(() => { run.deploy(A); return run.deploy(B) })
      await run.sync()
      run.cache = new LocalCache()
      await run.load(C.location)
    })

    // ------------------------------------------------------------------------

    it('throws if deploy and send', async () => {
      const run = new Run()
      class A extends Jig { static send (to) { this.owner = to } }
      const to = new PrivateKey().publicKey.toString()
      expect(() => run.transaction(() => { const C = run.deploy(A); C.send(to); return C }))
        .to.throw('Cannot set owner: unbound')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy and destroy', async () => {
      const run = new Run()
      class A { }
      expect(() => run.transaction(() => { const C = run.deploy(A); C.destroy(); return C }))
        .to.throw('delete disabled: A has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if create unbound and update', () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      expect(() => run.transaction(() => { const a = new A(); a.f(); return a }))
        .to.throw('Cannot set n: unbound')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy and call', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1; return A } }
      expect(() => run.transaction(() => run.deploy(A).f()))
        .to.throw('Cannot set n: unbound')
    })

    // ------------------------------------------------------------------------

    it('create bound and update', async () => {
      const run = new Run()
      class A extends Jig {
        f () { return new B() }
      }
      class B extends Jig {
        g () { this.n = 1 }
        h () { this.m = 2 }
      }
      A.deps = { B }
      const a = new A()
      await a.sync()
      const b = run.transaction(() => {
        const b = a.f()
        b.g()
        b.h()
        return b
      })
      await run.sync()
      function test (b) { expect(b.n + b.m).to.equal(3) }
      test(b)
      run.cache = new LocalCache()
      const b2 = await run.load(b.location)
      test(b2)
    })

    // ------------------------------------------------------------------------

    it('create bound and destroy', async () => {
      const run = new Run()
      class A extends Jig {
        f () { return new B() }
      }
      class B extends Jig {
        g () { this.n = 1 }
        h () { this.m = 2 }
      }
      A.deps = { B }
      const a = new A()
      await a.sync()
      const b = run.transaction(() => {
        const b = a.f()
        b.destroy()
        return b
      })
      await run.sync()
      function test (b) { expect(b.location.endsWith('_d0')).to.equal(true) }
      test(b)
      run.cache = new LocalCache()
      const b2 = await run.load(b.location)
      test(b2)
    })

    // ------------------------------------------------------------------------

    it('throws if create and destroy', async () => {
      const run = new Run()
      class A extends Jig { }
      expect(() => run.transaction(() => { const a = new A(); a.destroy(); return a }))
        .to.throw('delete disabled: [jig A] has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('throws if create and send', async () => {
      const run = new Run()
      class A extends Jig { send (to) { this.owner = to } }
      const to = new PrivateKey().publicKey.toString()
      expect(() => run.transaction(() => { const a = new A(); a.send(to); return a }))
        .to.throw('Cannot set owner: unbound')
    })

    // ------------------------------------------------------------------------

    it('throws if create and upgrade', async () => {
      const run = new Run()
      class A extends Jig { }
      class B extends Jig { }
      expect(() => run.transaction(() => { const a = new A(); a.constructor.upgrade(B); return a }))
        .to.throw('update disabled: B has an unbound owner or satoshis value')
    })

    // ------------------------------------------------------------------------

    it('call and call', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      const a = new A()
      const b = new A()
      run.transaction(() => { a.f(); b.f() })
      function test (a, b) { expect(a.n).to.equal(1); expect(b.n).to.equal(1) }
      test(a, b)
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      test(a2, b2)
    })

    // ------------------------------------------------------------------------

    it('call and auth', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      const a = new A()
      run.transaction(() => { a.f(); a.auth() })
      function test (a) { expect(a.nonce).to.equal(2) }
      await run.sync()
      test(a)
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      test(a2)
    })

    // ------------------------------------------------------------------------

    it('call and destroy', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      const C = run.deploy(A)
      run.transaction(() => { C.f(); C.destroy() })
      function test (C) { expect(C.location.endsWith('_d0')).to.equal(true) }
      await run.sync()
      test(C)
      run.cache = new LocalCache()
      const C2 = await run.load(C.location)
      test(C2)
    })

    // ------------------------------------------------------------------------

    it('upgrade and call', async () => {
      const run = new Run()
      class A extends Jig { static f () { return 1 }}
      class B extends Jig { static f () { return 2 }}
      const C = run.deploy(A)
      expect(run.transaction(() => { C.upgrade(B); return C.f() })).to.equal(2)
      function test (C) { expect(C.name).to.equal('B') }
      test(C)
      await run.sync()
      run.cache = new LocalCache()
      const C2 = await run.load(C.location)
      test(C2)
    })

    // ------------------------------------------------------------------------

    it('throws if deploy and call', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      expect(() => run.transaction(() => { const C = run.deploy(A); C.f(); return C }))
        .to.throw('Cannot set n: unbound')
    })

    // ------------------------------------------------------------------------

    it('destroy and destroy', async () => {
      const run = new Run()
      class A extends Jig { }
      const C = run.deploy(A)
      run.transaction(() => { C.destroy(); C.destroy() })
      await run.sync()
      run.cache = new LocalCache()
      await run.load(C.location)
    })

    // ------------------------------------------------------------------------

    it('throws if deploy and auth', async () => {
      const run = new Run()
      class A { }
      const error = 'auth unavailable on new jigs'
      expect(() => run.transaction(() => { const C = run.deploy(A); C.auth() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if create and auth', async () => {
      const run = new Run()
      class A extends Jig { }
      const error = 'auth unavailable on new jigs'
      expect(() => run.transaction(() => { const a = new A(); a.auth() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy and auth jig', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      const error = 'Cannot auth destroyed jigs'
      expect(() => run.transaction(() => { a.destroy(); a.auth() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy and auth code', async () => {
      const run = new Run()
      class A extends Jig { }
      const C = run.deploy(A)
      const error = 'Cannot auth destroyed jigs'
      expect(() => run.transaction(() => { C.destroy(); C.auth() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if destroy and upgrade', () => {
      const run = new Run()
      const A = run.deploy(class A { })
      const error = 'Cannot upgrade destroyed jig'
      expect(() => run.transaction(() => { A.destroy(); A.upgrade(class B { }) })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade and create unupgraded', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      await A.sync()
      const A2 = await run.load(A.location)
      const error = 'Inconsistent worldview'
      class B extends Jig { }
      expect(() => run.transaction(() => { A.upgrade(B); return new A2() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if send and call', async () => {
      const run = new Run()
      class A extends Jig { static send (to) { this.owner = to }; static f () { this.n = 1 } }
      const to = new PrivateKey().toAddress().toString()
      const C = run.deploy(A)
      const error = 'Cannot set n: unbound'
      expect(() => run.transaction(() => { C.send(to); C.f() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if send and destroy', async () => {
      const run = new Run()
      class A extends Jig { static send (to) { this.owner = to } }
      const to = new PrivateKey().toAddress().toString()
      const C = run.deploy(A)
      const error = 'delete disabled: A has an unbound owner or satoshis value'
      expect(() => run.transaction(() => { C.send(to); C.destroy() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if send and auth', async () => {
      const run = new Run()
      class A extends Jig { static send (to) { this.owner = to } }
      const to = new PrivateKey().toAddress().toString()
      const C = run.deploy(A)
      const error = 'auth disabled: A has an unbound owner or satoshis value'
      expect(() => run.transaction(() => { C.send(to); C.auth() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if update different instances of same jig', async () => {
      const run = new Run()
      class A extends Jig { f () { this.n = 1 } }
      const a1 = new A()
      await a1.sync()
      const a2 = await run.load(a1.location)
      const error = 'Inconsistent worldview'
      expect(() => run.transaction(() => { a1.f(); a2.f() })).to.throw(error)
      expect(() => run.transaction(() => { a1.auth(); a2.auth() })).to.throw(error)
      expect(() => run.transaction(() => { a1.destroy(); a2.destroy() })).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if conflicting updates', async () => {
      const run = new Run()
      class A extends Jig { }
      const a1 = new A()
      await a1.sync()
      const a2 = await run.load(a1.location)
      run.transaction(() => a1.auth())
      run.transaction(() => a2.auth())
      const error = '[jig A] was spent in another transaction'
      await expect(run.sync()).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if async', () => {
      const run = new Run()
      expect(() => run.transaction(async () => {})).to.throw('async transactions not supported')
      expect(() => run.transaction(() => Promise.resolve())).to.throw('async transactions not supported')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid callback', () => {
      const run = new Run()
      expect(() => run.transaction()).to.throw('Invalid callback')
      expect(() => run.transaction(null)).to.throw('Invalid callback')
      expect(() => run.transaction({})).to.throw('Invalid callback')
    })
  })

  // --------------------------------------------------------------------------
  // update
  // --------------------------------------------------------------------------

  describe('update', () => {
    it('multiple updates', async () => {
      const run = new Run()
      class A extends Jig { static f () { this.n = 1 } }
      const C = run.deploy(A)
      const tx = new Transaction()
      tx.update(() => C.f())
      tx.update(() => C.destroy())
      await tx.publish()
      run.cache = new LocalCache()
      await run.load(C.location)
    })

    // ------------------------------------------------------------------------

    it('multiple upgrades', async () => {
      const run = new Run()
      const A = run.deploy(class A { })
      const tx = new Transaction()
      tx.update(() => A.upgrade(class B { }))
      tx.update(() => A.upgrade(class C { }))
      tx.update(() => A.upgrade(class D { }))
      await tx.publish()
      expect(A.name).to.equal('D')
      run.cache = new LocalCache()
      const A2 = await run.load(A.location)
      expect(A2.name).to.equal('D')
    })

    // ------------------------------------------------------------------------

    it('create and upgrade', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      run.deploy(A)
      const a = tx.update(() => new A())
      class B extends Jig { }
      tx.update(() => a.constructor.upgrade(B))
      expect(a.constructor.name).to.equal('B')
      await tx.publish()
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      expect(a2.constructor.name).to.equal('B')
    })

    // ------------------------------------------------------------------------

    it('throws if update outside before publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.n = 1 } }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      expect(() => a.f()).to.throw('Cannot update [jig A]: open transaction')
      tx.publish()
      a.f()
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if sign outside before publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      expect(() => a.auth()).to.throw('Cannot auth [jig A]: open transaction')
      await tx.export()
      expect(() => a.auth()).to.throw('Cannot auth [jig A]: open transaction')
      await tx.publish()
      a.auth()
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if destroy jig open in another transaction', async () => {
      const run = new Run()
      const tx1 = new Transaction()
      const A = tx1.update(() => run.deploy(class A { }))
      const tx2 = new Transaction()
      const error = 'Cannot delete A: open transaction'
      expect(() => tx2.update(() => A.destroy())).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if async', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(async () => {})).to.throw('async transactions not supported')
      expect(() => tx.update(() => Promise.resolve())).to.throw('async transactions not supported')
    })

    // ------------------------------------------------------------------------

    it('throws if sync all', () => {
      const run = new Run()
      const tx = new Transaction()
      expect(() => tx.update(() => { run.sync() })).to.throw('sync all disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if sync', () => {
      const run = new Run()
      const tx = new Transaction()
      const A = run.deploy(class A extends Jig { })
      const a = new A()
      expect(() => tx.update(() => { A.sync() })).to.throw('sync disabled during atomic update')
      expect(() => tx.update(() => { a.sync() })).to.throw('sync disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if load', () => {
      const run = new Run()
      const tx = new Transaction()
      expect(() => tx.update(() => { run.load('abc') })).to.throw('load disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if jig load', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      expect(() => tx.update(() => { A.load('abc') })).to.throw('load disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if berry load', async () => {
      const run = new Run()
      const tx = new Transaction()
      class B extends Berry { }
      const CB = run.deploy(B)
      await CB.sync()
      expect(() => tx.update(() => { CB.load('abc') })).to.throw('load disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if activate', () => {
      const run2 = new Run()
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { return new Run() })).to.throw('activate disabled during atomic update')
      expect(() => tx.update(() => { run2.activate() })).to.throw('activate disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if deactivate', () => {
      const run = new Run()
      const tx = new Transaction()
      expect(() => tx.update(() => { run.deactivate() })).to.throw('deactivate disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if import', () => {
      const run = new Run()
      const tx = new Transaction()
      expect(() => tx.update(() => { run.import() })).to.throw('import disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if update', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.update(() => { }) })).to.throw('update disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if pay', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.pay() })).to.throw('pay disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if sign', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.sign() })).to.throw('sign disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if publish', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.publish() })).to.throw('publish disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if export', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.export() })).to.throw('export disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if rollback', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update(() => { tx.rollback() })).to.throw('rollback disabled during atomic update')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid callback', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.update()).to.throw('Invalid callback')
      expect(() => tx.update(null)).to.throw('Invalid callback')
      expect(() => tx.update({})).to.throw('Invalid callback')
    })

    // ------------------------------------------------------------------------

    it('throws after publish', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.publish()
      expect(() => tx.update(() => run.deploy(class B { }))).to.throw('update disabled once published')
    })

    // ------------------------------------------------------------------------

    it('throws during publish', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.publish()
      expect(() => tx.update(() => run.deploy(class B { }))).to.throw('update disabled during publish')
    })

    // ------------------------------------------------------------------------

    it('throws during export', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      expect(() => tx.update(() => run.deploy(class B { }))).to.throw('update disabled during export')
    })

    // ------------------------------------------------------------------------

    it('throws during sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.sign()
      expect(() => tx.update(() => run.deploy(class B { }))).to.throw('update disabled during sign')
    })

    // ------------------------------------------------------------------------

    it('throws during pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.pay()
      expect(() => tx.update(() => run.deploy(class B { }))).to.throw('update disabled during pay')
    })
  })

  // --------------------------------------------------------------------------
  // publish
  // --------------------------------------------------------------------------

  describe('publish', () => {
    it('manual publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      const b = tx.update(() => new A())
      const txid = await tx.publish()
      expect(a.location.slice(0, 64)).to.equal(b.location.slice(0, 64))
      expect(a.location.slice(0, 64)).to.equal(txid)
    })

    // ------------------------------------------------------------------------

    it('dedups publish', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => new A())
      const promise1 = tx.publish()
      const promise2 = tx.publish()
      expect(promise1).to.equal(promise2)
    })

    // ------------------------------------------------------------------------

    it('only publishes once', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      await tx.publish()
      const alocation = a.location
      await tx.publish()
      expect(a.location).to.equal(alocation)
    })

    // ------------------------------------------------------------------------

    it('parallel transactions', async () => {
      const run = new Run()
      const tx1 = new Transaction()
      const A = tx1.update(() => run.deploy(class A { }))
      const tx2 = new Transaction()
      const B = tx2.update(() => run.deploy(class B { }))
      tx1.publish()
      tx2.publish()
      await run.sync()
      run.cache = new LocalCache()
      await run.load(A.location)
      await run.load(B.location)
    })

    // ------------------------------------------------------------------------

    it('waits for upstream commits', async () => {
      const run = new Run()
      class A { }
      run.deploy(A)
      const B = run.transaction(() => run.deploy(class B extends A {}))
      await B.sync()
      run.cache = new LocalCache()
      await run.load(B.location)
    })

    // ------------------------------------------------------------------------

    it('re-publish after fail', async () => {
      const run = new Run()
      const tx = new Transaction()
      const A = tx.update(() => run.deploy(class A { }))
      stub(run.blockchain, 'broadcast').onFirstCall().throws()
      await expect(tx.publish()).to.be.rejected
      run.blockchain.broadcast.callThrough()
      await tx.publish()
      expect(A.location.endsWith('_o1')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('manual pay and sign', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.auth())
      await tx.pay()
      await tx.sign()
      await tx.publish({ pay: false, sign: false })
    })

    // ------------------------------------------------------------------------

    it('throws if empty', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      tx.update(() => {})
      expect(() => tx.publish()).to.throw('Nothing to commit')
    })

    // ------------------------------------------------------------------------

    it('throws if pay disabled on new transaction', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      const error = 'tx has no inputs'
      await expect(tx.publish({ pay: false })).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if sign disabled on new transaction', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      const a = new A()
      tx.update(() => a.auth())
      const error = 'Missing signature for [jig A]'
      await expect(tx.publish({ sign: false })).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid pay option', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      expect(() => tx.publish({ pay: null })).to.throw('Invalid pay')
      expect(() => tx.publish({ pay: 1 })).to.throw('Invalid pay')
      expect(() => tx.publish({ pay: '' })).to.throw('Invalid pay')
      expect(() => tx.publish({ pay: () => { } })).to.throw('Invalid pay')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid sign option', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      expect(() => tx.publish({ sign: null })).to.throw('Invalid sign')
      expect(() => tx.publish({ sign: 1 })).to.throw('Invalid sign')
      expect(() => tx.publish({ sign: '' })).to.throw('Invalid sign')
      expect(() => tx.publish({ sign: () => { } })).to.throw('Invalid sign')
    })

    // ------------------------------------------------------------------------

    it('throws during export', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      expect(() => tx.publish()).to.throw('publish disabled during export')
    })

    // ------------------------------------------------------------------------

    it('throws during pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.pay()
      expect(() => tx.publish()).to.throw('publish disabled during pay')
    })

    // ------------------------------------------------------------------------

    it('throws during sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.sign()
      expect(() => tx.publish()).to.throw('publish disabled during sign')
    })

    // ------------------------------------------------------------------------

    it('throws if pay after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.publish()
      expect(() => tx.pay()).to.throw('pay disabled once published')
    })

    // ------------------------------------------------------------------------

    it('throws if sign after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.publish()
      expect(() => tx.sign()).to.throw('sign disabled once published')
    })

    // ------------------------------------------------------------------------

    it('throws if export with pay after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.publish()
      expect(() => tx.export({ pay: true, sign: false })).to.throw('pay disabled once published')
    })
  })

  // --------------------------------------------------------------------------
  // export
  // --------------------------------------------------------------------------

  describe('export', () => {
    it('exports hex transaction', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      expect(typeof rawtx).to.equal('string')
      expect(rawtx.length > 0).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('paid and signed', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      await run.blockchain.broadcast(rawtx)
    })

    // ------------------------------------------------------------------------

    it('unpaid', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ pay: false })
      const error = 'tx has no inputs'
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('unsigned', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      const rawtx = await tx.export({ sign: false })
      const error = 'mandatory-script-verify-flag-failed'
      await expect(run.blockchain.broadcast(rawtx)).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('waits for upstream commits', async () => {
      new Run() // eslint-disable-line
      class B extends Jig { }
      class A extends Jig {
        init (b) {
          this.b = b
        }
      }
      const transaction = new Transaction()
      const b = new B()
      transaction.update(() => new A(b))
      await transaction.export()
    })

    // ------------------------------------------------------------------------

    it('dedups exports', () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const promise1 = tx.export()
      const promise2 = tx.export()
      expect(promise1).to.equal(promise2)
    })

    // ------------------------------------------------------------------------

    it('update and re-export', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const C = run.deploy(A)
      tx.update(() => C.auth())
      const rawtx1 = await tx.export()
      tx.update(() => C.destroy())
      const rawtx2 = await tx.export()
      tx.rollback()
      expect(rawtx1).not.to.equal(rawtx2)
      await run.blockchain.broadcast(rawtx2)
      await C.sync()
      expect(C.location.endsWith('_d0')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('publish after export', async () => {
      const run = new Run()
      const tx = new Transaction()
      const A = tx.update(() => run.deploy(class A { }))
      await tx.export()
      await tx.publish()
      await A.sync()
      expect(A.location.endsWith('_o1')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('manual pay and sign', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.auth())
      await tx.pay()
      await tx.sign()
      await tx.export({ pay: false, sign: false })
    })

    // ------------------------------------------------------------------------

    it('throws if invalid pay option', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      expect(() => tx.export({ pay: null })).to.throw('Invalid pay')
      expect(() => tx.export({ pay: 1 })).to.throw('Invalid pay')
      expect(() => tx.export({ pay: '' })).to.throw('Invalid pay')
      expect(() => tx.export({ pay: () => { } })).to.throw('Invalid pay')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid sign option', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      expect(() => tx.export({ sign: null })).to.throw('Invalid sign')
      expect(() => tx.export({ sign: 1 })).to.throw('Invalid sign')
      expect(() => tx.export({ sign: '' })).to.throw('Invalid sign')
      expect(() => tx.export({ sign: () => { } })).to.throw('Invalid sign')
    })

    // ------------------------------------------------------------------------

    it('re-export after fail', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      stub(run.purse, 'pay').callsFake(x => x).onFirstCall().throws()
      await expect(tx.export()).to.be.rejected
      await tx.export()
    })

    // ------------------------------------------------------------------------

    it('sync during export ok', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      await run.sync()
    })

    // ------------------------------------------------------------------------

    it('throws if empty', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.export()).to.throw('Nothing to commit')
    })

    // ------------------------------------------------------------------------

    it('throws during publish', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.publish()
      expect(() => tx.export()).to.throw('export disabled during publish')
    })

    // ------------------------------------------------------------------------

    it('throws during pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.pay()
      expect(() => tx.export()).to.throw('export disabled during pay')
    })

    // ------------------------------------------------------------------------

    it('throws during sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.sign()
      expect(() => tx.export()).to.throw('export disabled during sign')
    })
  })

  // --------------------------------------------------------------------------
  // rollback
  // --------------------------------------------------------------------------

  describe('rollback', () => {
    it('rolls back creates', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      const a = tx.update(() => new A())
      tx.rollback()
      await run.sync()
      expect(() => a.location).to.throw('Cannot read location')
      expect(() => a.origin).to.throw('Cannot read origin')
      expect(() => a.nonce).to.throw('Cannot read nonce')
    })

    // ------------------------------------------------------------------------

    it('rolls back deploys', async () => {
      const run = new Run()
      const tx = new Transaction()
      const A = tx.update(() => run.deploy(class A { }))
      tx.rollback()
      await run.sync()
      expect(() => A.location).to.throw('Cannot read location')
      expect(() => A.origin).to.throw('Cannot read origin')
      expect(() => A.nonce).to.throw('Cannot read nonce')
      await A.sync()
    })

    // ------------------------------------------------------------------------

    it('rolls back updates', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.n = 1 } }
      const a = new A()
      await a.sync()
      const tx = new Transaction()
      tx.update(() => a.f())
      expect(a.n).to.equal(1)
      tx.rollback()
      expect(typeof a.n).to.equal('undefined')
      expect(a.location).to.equal(a.origin)
    })

    // ------------------------------------------------------------------------

    it('rolls back destroys', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      tx.rollback()
      expect(a.location).to.equal(a.origin)
    })

    // ------------------------------------------------------------------------

    it('rolls back auths', async () => {
      const run = new Run()
      const A = run.deploy(class A { })
      await run.sync()
      const tx = new Transaction()
      tx.update(() => A.auth())
      tx.rollback()
      expect(A.location).to.equal(A.origin)
    })

    // ------------------------------------------------------------------------

    it('rolls back upgrades', async () => {
      const run = new Run()
      const A = run.deploy(class A {
        f () { }
        static g () { }
      })
      class B {
        h () { }
        static i () { }
      }
      await run.sync()
      const tx = new Transaction()
      tx.update(() => A.upgrade(B))
      expect(A.name).to.equal('B')
      expect(typeof A.prototype.f).to.equal('undefined')
      expect(typeof A.prototype.h).to.equal('function')
      expect(typeof A.g).to.equal('undefined')
      expect(typeof A.i).to.equal('function')
      tx.rollback()
      expect(A.location).to.equal(A.origin)
      expect(A.name).to.equal('A')
      expect(typeof A.prototype.f).to.equal('function')
      expect(typeof A.prototype.h).to.equal('undefined')
      expect(typeof A.g).to.equal('function')
      expect(typeof A.i).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('throws if use undeployed jig after rollback', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      tx.rollback()
      await expect(a.sync()).to.be.rejectedWith('Cannot sync')
      expect(() => a.location).to.throw('Cannot read location')
    })

    // ------------------------------------------------------------------------

    it('rollback then re-update', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { static f () { this.n = 1 } })
      const tx = new Transaction()
      tx.update(() => A.f())
      expect(A.n).to.equal(1)
      tx.rollback()
      expect(typeof A.n).to.equal('undefined')
      tx.update(() => A.f())
      await tx.publish()
      expect(A.n).to.equal(1)
      await run.load(A.location)
      expect(A.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('rollback then re-upgrade', async () => {
      const run = new Run()
      const A = run.deploy(class A extends Jig { })
      class B extends Jig { }
      const tx = new Transaction()
      tx.update(() => A.upgrade(B))
      tx.rollback()
      tx.update(() => A.upgrade(B))
      await tx.publish()
      expect(A.name).to.equal('B')
      run.cache = new LocalCache()
      await run.load(A.location)
      expect(A.name).to.equal('B')
    })

    // ------------------------------------------------------------------------

    it('rollback then re-destroy', async () => {
      const run = new Run()
      class A extends Jig { destroy () { super.destroy(); this.destroyed = true }}
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      expect(a.destroyed).to.equal(true)
      tx.rollback()
      expect(!!a.destroyed).to.equal(false)
      tx.update(() => a.destroy())
      await tx.publish()
      const a2 = await run.load(a.location)
      expect(a2.destroyed).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('rollback twice', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      tx.rollback()
      tx.rollback()
      await run.sync()
      expect(typeof Object.getOwnPropertyDescriptor(A, 'location')).to.equal('undefined')
      expect(typeof Object.getOwnPropertyDescriptor(A, 'presets')).to.equal('undefined')
    })

    // ------------------------------------------------------------------------

    it('rollback after export', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => new A())
      const rawtx = await tx.export()
      tx.rollback()
      const tx2 = await run.import(rawtx)
      await tx2.publish()
      expect(tx2.outputs.length).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('throws during publish', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.publish()
      expect(() => tx.rollback()).to.throw('rollback disabled during publish')
    })

    // ------------------------------------------------------------------------

    it('throws after publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => new A())
      await tx.publish()
      const error = 'rollback disabled once published'
      expect(() => tx.rollback()).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws during export', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      expect(() => tx.rollback()).to.throw('rollback disabled during export')
    })

    // ------------------------------------------------------------------------

    it('throws during pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.pay()
      expect(() => tx.rollback()).to.throw('rollback disabled during pay')
    })

    // ------------------------------------------------------------------------

    it('throws during sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.sign()
      expect(() => tx.rollback()).to.throw('rollback disabled during sign')
    })
  })

  // --------------------------------------------------------------------------
  // pay
  // --------------------------------------------------------------------------

  describe('pay', () => {
    it('pay for transaction', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.publish({ pay: false })
    })

    // ------------------------------------------------------------------------

    it('multiple pays same purse', async () => {
      const run = new Run()
      stub(run.purse, 'pay').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.pay()
      await tx.pay()
      expect(run.purse.pay.getCalls().length).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('multiple pays different purses', async () => {
      const run = new Run()
      const purse1 = run.purse
      const purse2 = new LocalPurse({ blockchain: run.blockchain })
      const purse1PayStub = stub(purse1, 'pay').callThrough()
      const purse2PayStub = stub(purse2, 'pay').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      run.purse = purse1
      await tx.pay()
      run.purse = purse2
      await tx.pay()
      await tx.publish({ pay: false })
      expect(purse1PayStub.calledOnce).to.equal(true)
      expect(purse2PayStub.calledOnce).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('pay again during publish', async () => {
      const run = new Run()
      stub(run.purse, 'pay').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.publish()
      expect(run.purse.pay.calledTwice).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('pay again during export', async () => {
      const run = new Run()
      stub(run.purse, 'pay').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.export()
      expect(run.purse.pay.calledTwice).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('dedups pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      const promise = tx.pay()
      expect(tx.pay()).to.equal(promise)
    })

    // ------------------------------------------------------------------------

    it('throws if pay with no updates', () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.pay()).to.throw('Nothing to commit')
    })

    // ------------------------------------------------------------------------

    it('throws during publish', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.publish()
      expect(() => tx.pay()).to.throw('pay disabled during publish')
    })

    // ------------------------------------------------------------------------

    it('throws during export', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      expect(() => tx.pay()).to.throw('pay disabled during export')
    })

    // ------------------------------------------------------------------------

    it('throws during sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.sign()
      expect(() => tx.pay()).to.throw('pay disabled during sign')
    })
  })

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  describe('sign', () => {
    it('sign transaction', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.sign()
      await tx.publish({ pay: false, sign: false })
    })

    // ------------------------------------------------------------------------

    it('multiple signs same owner', async () => {
      const run = new Run()
      stub(run.owner, 'sign').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.sign()
      await tx.sign()
      await tx.sign()
      expect(run.owner.sign.getCalls().length).to.equal(3)
    })

    // ------------------------------------------------------------------------

    it('multiple signs different owners', async () => {
      const run = new Run()
      const owner1 = run.owner
      const owner2 = new LocalOwner()
      const owner1SignStub = stub(owner1, 'sign').callThrough()
      const owner2SignStub = stub(owner2, 'sign').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      run.owner = owner1
      await tx.sign()
      run.owner = owner2
      await tx.sign()
      await tx.publish({ sign: false })
      expect(owner1SignStub.calledOnce).to.equal(true)
      expect(owner2SignStub.calledOnce).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('sign again during publish', async () => {
      const run = new Run()
      stub(run.owner, 'sign').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.sign()
      await tx.publish()
      expect(run.owner.sign.calledTwice).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('sign again during export', async () => {
      const run = new Run()
      stub(run.owner, 'sign').callThrough()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.pay()
      await tx.sign()
      await tx.export()
      expect(run.owner.sign.calledTwice).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('dedups sign', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      const promise = tx.sign()
      expect(tx.sign()).to.equal(promise)
    })

    // ------------------------------------------------------------------------

    it('throws if sign with no updates', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      expect(() => tx.sign()).to.throw('Nothing to commit')
    })

    // ------------------------------------------------------------------------

    it('throws during publish', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.publish()
      expect(() => tx.sign()).to.throw('sign disabled during publish')
    })

    // ------------------------------------------------------------------------

    it('throws during export', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.export()
      expect(() => tx.sign()).to.throw('sign disabled during export')
    })

    // ------------------------------------------------------------------------

    it('throws during pay', () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      tx.pay()
      expect(() => tx.sign()).to.throw('sign disabled during pay')
    })

    // ------------------------------------------------------------------------

    it('throws if sign without pay', async () => {
      const run = new Run()
      const tx = new Transaction()
      tx.update(() => run.deploy(class A { }))
      await tx.sign()
      await expect(tx.publish({ pay: false, sign: false })).to.be.rejected
    })
  })

  // --------------------------------------------------------------------------
  // import
  // --------------------------------------------------------------------------

  describe('import', () => {
    it('unpublished', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const tx2 = await run.import(rawtx)
      tx2.update(() => run.deploy(class B { }))
      await tx2.publish()
    })

    // ------------------------------------------------------------------------

    it('published', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await a.sync()
      const txid = a.location.slice(0, 64)
      const rawtx = await run.blockchain.fetch(txid)
      const tx = await run.import(rawtx)
      await tx.publish()
      const rawtx2 = await tx.export({ pay: false, sign: false })
      expect(rawtx).to.equal(rawtx2)
    })

    // ------------------------------------------------------------------------

    it('import and publish emits jig events', async () => {
      const callback = fake()
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const tx2 = await run.import(rawtx)
      run.on('publish', callback)
      await tx2.publish()
      expect(callback.called).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('import, update, and publish emits jig events', async () => {
      const callback = fake()
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const tx2 = await run.import(rawtx)
      tx2.update(() => run.deploy(class B { }))
      run.on('publish', callback)
      await tx2.publish()
      expect(callback.called).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('import and publish adds to cache', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => new A())
      const rawtx = await tx.export()
      run.cache = new LocalCache()
      const tx2 = await run.import(rawtx)
      await tx2.publish()
      expect(!!(await run.cache.get('jig://' + tx2.outputs[0].location))).to.equal(true)
      expect(!!(await run.cache.get('jig://' + tx2.outputs[1].location))).to.equal(true)
    })
    // ------------------------------------------------------------------------

    it('import, update, and publish adds to cache', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => new A())
      const rawtx = await tx.export()
      run.cache = new LocalCache()
      const tx2 = await run.import(rawtx)
      tx2.update(() => run.deploy(class B { }))
      await tx2.publish()
      expect(!!(await run.cache.get('jig://' + tx2.outputs[0].location))).to.equal(true)
      expect(!!(await run.cache.get('jig://' + tx2.outputs[1].location))).to.equal(true)
      expect(!!(await run.cache.get('jig://' + tx2.outputs[2].location))).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('same transaction twice ok', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const tx1 = await run.import(rawtx)
      const tx2 = await run.import(rawtx)
      expect(tx1).not.to.equal(tx2)
    })

    // ------------------------------------------------------------------------

    it('unsigned', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ signed: false })
      const tx2 = await run.import(rawtx)
      await tx2.publish({ pay: false })
    })

    // ------------------------------------------------------------------------

    it('unpaid', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ pay: false })
      const tx2 = await run.import(rawtx)
      await tx2.publish()
    })

    // ------------------------------------------------------------------------

    it('paid twice', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ sign: false })
      const tx2 = await run.import(rawtx)
      await tx2.publish()
    })

    // ------------------------------------------------------------------------

    it('signed twice', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export({ pay: false })
      const tx2 = await run.import(rawtx)
      await tx2.publish()
    })

    // ------------------------------------------------------------------------

    it('throws if publish unsigned', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      await run.sync()
      const tx = new Transaction()
      tx.update(() => a.auth())
      const rawtx = await tx.export({ sign: false })
      const tx2 = await run.import(rawtx)
      const error = 'Missing signature for [jig A]'
      await expect(tx2.publish({ sign: false })).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if non-run transaction', async () => {
      const run = new Run()
      const Buffer = bsv.deps.Buffer
      const prefix = Buffer.from('slp', 'utf8')
      const dat = Buffer.from('', 'utf8')
      const slpscript = bsv.Script.buildSafeDataOut([prefix, dat, dat, dat, dat])
      const slpoutput = new bsv.Transaction.Output({ script: slpscript, satoshis: 0 })
      const tx = new bsv.Transaction().addOutput(slpoutput).to(run.purse.address, 1000)
      const rawtx = tx.toString('hex')
      const error = 'Not a RUN transaction: invalid OP_RETURN protocol'
      await expect(run.import(rawtx)).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if unsupported version', async () => {
      const run = new Run()
      const Buffer = bsv.deps.Buffer
      const prefix = Buffer.from('run', 'utf8')
      const ver = Buffer.from([0x04])
      const app = Buffer.from('', 'utf8')
      const json = Buffer.from('{}', 'utf8')
      const runscript = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
      const runoutput = new bsv.Transaction.Output({ script: runscript, satoshis: 0 })
      const tx = new bsv.Transaction().addOutput(runoutput).to(run.purse.address, 1000)
      const rawtx = tx.toString('hex')
      const error = 'Unsupported RUN transaction version: 04'
      await expect(run.import(rawtx)).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if invalid metadata', async () => {
      const run = new Run()
      const Buffer = bsv.deps.Buffer
      const prefix = Buffer.from('run', 'utf8')
      const ver = Buffer.from([0x05])
      const app = Buffer.from('', 'utf8')
      const json = Buffer.from('{}', 'utf8')
      const runscript = bsv.Script.buildSafeDataOut([prefix, ver, app, json])
      const runoutput = new bsv.Transaction.Output({ script: runscript, satoshis: 0 })
      const tx = new bsv.Transaction().addOutput(runoutput).to(run.purse.address, 1000)
      const rawtx = tx.toString('hex')
      const error = 'Not a RUN transaction: invalid RUN metadata'
      await expect(run.import(rawtx)).to.be.rejectedWith(error)
    })
  })

  // --------------------------------------------------------------------------
  // sync
  // --------------------------------------------------------------------------

  describe('sync', () => {
    it('run sync unpublished ok', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      const a = tx.update(() => new A())
      await run.sync()
      expect(() => a.location).to.throw('Cannot read location')
      await tx.publish()
      expect(() => a.location).not.to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if sync transaction jig', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      const error = 'Cannot sync [jig A]: transaction in progress'
      await expect(a.sync()).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if sync transaction code', async () => {
      const run = new Run()
      class A { }
      const tx = new Transaction()
      const C = tx.update(() => run.deploy(A))
      const error = 'Cannot sync A: transaction in progress'
      await expect(C.sync()).to.be.rejectedWith(error)
    })

    // ------------------------------------------------------------------------

    it('throws if sync destroyed transaction creation', async () => {
      const run = new Run()
      class A { }
      const C = run.deploy(A)
      const tx = new Transaction()
      tx.update(() => C.destroy())
      const error = 'Cannot sync A: transaction in progress'
      await expect(C.sync()).to.be.rejectedWith(error)
    })
  })

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  describe('Getters', () => {
    it('outputs', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { set (n) { this.n = n } }

      const a = new A()
      const b = new A()

      const tx = new Transaction()
      const c = new A()
      tx.update(() => c.set(2))
      tx.update(() => a.auth())
      tx.update(() => b.set(1))
      tx.update(() => b.destroy(1))

      expect(tx.outputs.length).to.equal(2)
      expect(tx.outputs[0]).to.equal(c)
      expect(tx.outputs[1]).to.equal(a)
    })

    // ------------------------------------------------------------------------

    it('deletes', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      expect(tx.deletes).to.deep.equal([a])
    })

    // ------------------------------------------------------------------------

    it('newly created deletes', () => {
      const run = new Run()
      const tx = new Transaction()
      class A { }
      const C = run.deploy(A)
      tx.update(() => { C.destroy() })
      expect(tx.deletes.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('stores states after', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        destroy () { super.destroy(); this.n = 1 }
        static f () { this.m = 2 }
      }
      const tx = new Transaction()
      const a = new A()
      tx.update(() => a.destroy())
      tx.update(() => a.constructor.f())
      expect(tx.deletes[0].n).to.equal(1)
      expect(tx.outputs[0].m).to.equal(2)
    })

    // ------------------------------------------------------------------------

    it('correct after import', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const a = new A()
      tx.update(() => a.destroy())
      const rawtx = await tx.export()
      const tx2 = await run.import(rawtx)
      expect(tx2.outputs.length).to.equal(0)
      expect(tx2.deletes.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('cannot be modified', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      tx.update(() => new A())
      tx.outputs.shift()
      expect(tx.outputs.length).to.equal(1)
      tx.deletes.push(1)
      expect(tx.deletes.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('empty after rollback', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      tx.update(() => new A())
      tx.rollback()
      expect(tx.outputs.length).to.equal(0)
      expect(tx.deletes.length).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('persists after publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      tx.update(() => new A())
      await tx.publish()
      expect(tx.outputs.length).to.equal(1)
      expect(tx.deletes.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('persists after export', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      tx.update(() => new A())
      await tx.export()
      expect(tx.outputs.length).to.equal(1)
      expect(tx.deletes.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('outputs dynamically updated', () => {
      const run = new Run()
      const tx = new Transaction()
      expect(tx.outputs).to.deep.equal([])
      expect(tx.deletes).to.deep.equal([])
      const CA = tx.update(() => run.deploy(class A extends Jig { }))
      expect(tx.outputs).to.deep.equal([CA])
      expect(tx.deletes).to.deep.equal([])
    })

    // ------------------------------------------------------------------------

    it('deletes dynamically updated', () => {
      const run = new Run()
      const CA = run.deploy(class A extends Jig { })
      const tx = new Transaction()
      expect(tx.outputs).to.deep.equal([])
      expect(tx.deletes).to.deep.equal([])
      tx.update(() => CA.destroy())
      expect(tx.outputs).to.deep.equal([])
      expect(tx.deletes).to.deep.equal([CA])
    })
  })

  // --------------------------------------------------------------------------
  // cache
  // --------------------------------------------------------------------------

  describe('cache', () => {
    it('caches outputs', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      const a = tx.update(() => new A())
      await tx.cache()
      expect(typeof await run.cache.get('jig://' + a.location)).to.equal('object')
      expect(typeof await run.cache.get('jig://' + A.location)).to.equal('object')
    })

    // ------------------------------------------------------------------------

    it('caches deleted', async () => {
      const run = new Run()
      class A extends Jig { }
      const a = new A()
      const tx = new Transaction()
      tx.update(() => a.destroy())
      await tx.cache()
      expect(a.location.endsWith('_d0')).to.equal(true)
      expect(typeof await run.cache.get('jig://' + a.location)).to.equal('object')
    })

    // ------------------------------------------------------------------------

    it('caches imported', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      const rawtx = await tx.export()
      tx.rollback()
      const txid = new bsv.Transaction(rawtx).hash
      expect(typeof await run.cache.get('jig://' + txid + '_o1')).to.equal('undefined')
      const tx2 = await run.import(rawtx)
      await tx2.cache()
      expect(typeof await run.cache.get('jig://' + txid + '_o1')).to.equal('object')
    })

    // ------------------------------------------------------------------------

    it('assigns locations', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      const CA = run.deploy(A)
      const a = tx.update(() => new A())
      tx.update(() => CA.destroy())
      await tx.cache()
      const ALocation = CA.location
      const aLocation = a.location
      const rawtx = await tx.export({ pay: false, sign: false })
      const txid = new bsv.Transaction(rawtx).hash
      expect(ALocation).to.equal(txid + '_d0')
      expect(aLocation).to.equal(txid + '_o1')
    })

    // ------------------------------------------------------------------------

    it('publish after', async () => {
      const run = new Run()
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.pay()
      await tx.cache()
      await tx.publish({ pay: false, sign: false })
      expect(typeof await run.blockchain.fetch(A.location.slice(0, 64))).to.equal('string')
    })

    // ------------------------------------------------------------------------

    it('export after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      await tx.export({ pay: false, sign: false })
    })

    // ------------------------------------------------------------------------

    it('throws if update after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      expect(() => tx.update(() => new A())).to.throw('update disabled once cached')
    })

    // ------------------------------------------------------------------------

    it('throws if pay after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      expect(() => tx.pay()).to.throw('pay disabled once cached')
    })

    // ------------------------------------------------------------------------

    it('throws if sign after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      expect(() => tx.sign()).to.throw('sign disabled once cached')
    })

    // ------------------------------------------------------------------------

    it('throws if publish with pay after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      expect(() => tx.publish({ pay: true, sign: false })).to.throw('pay disabled once cached')
    })

    // ------------------------------------------------------------------------

    it('throws if export with sign after', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      class A extends Jig { }
      tx.update(() => new A())
      await tx.cache()
      expect(() => tx.export({ pay: false, sign: true })).to.throw('sign disabled once cached')
    })
  })

  // --------------------------------------------------------------------------
  // base
  // --------------------------------------------------------------------------

  describe('base', () => {
    it('custom output', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const base = new bsv.Transaction()
      base.addOutput(new bsv.Transaction.Output({ script: 'OP_RETURN', satoshis: '123' }))
      tx.base = base.toString('hex')
      tx.update(() => run.deploy(A))
      await tx.publish()
      expect(A.location.endsWith('_o2')).to.equal(true)
      await run.load(A.location)
      run.cache = new LocalCache()
      await run.load(A.location)
    })

    // ------------------------------------------------------------------------

    it('metadata with custom output', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const base = new bsv.Transaction()
      base.addOutput(new bsv.Transaction.Output({ script: 'OP_RETURN', satoshis: '123' }))
      base.addOutput(new bsv.Transaction.Output({ script: 'OP_RETURN', satoshis: '456' }))
      tx.base = base.toString('hex')
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const metadata = Run.util.metadata(rawtx)
      expect(metadata.vrun).to.equal(2)
      expect(metadata.base).to.equal(tx.base)
      expect(metadata.out.length).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('custom lock time', async () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const base = new bsv.Transaction()
      base.nLockTime = 123
      tx.base = base.toString('hex')
      tx.update(() => run.deploy(A))
      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.nLockTime).to.equal(123)
    })

    // ------------------------------------------------------------------------

    it('get base after set', () => {
      const run = new Run()
      class A extends Jig { }
      const tx = new Transaction()
      const base = new bsv.Transaction()
      base.nLockTime = 123
      base.addOutput(new bsv.Transaction.Output({ script: 'OP_RETURN', satoshis: '456' }))
      tx.base = base.toString('hex')
      tx.update(() => run.deploy(A))
      const bsvtx = new bsv.Transaction(tx.base)
      expect(bsvtx.outputs.length).to.equal(1)
      expect(bsvtx.outputs[0].script.toString()).to.equal('OP_RETURN')
      expect(bsvtx.outputs[0].satoshis).to.equal(456)
      expect(bsvtx.nLockTime).to.equal(123)
    })

    // ------------------------------------------------------------------------

    it('throws if custom input', async () => {
      new Run() // eslint-disable-line
      const tx = new Transaction()
      const base = new bsv.Transaction()
      const txid = '0000000000000000000000000000000000000000000000000000000000000000'
      base.from({ script: 'OP_RETURN', amount: '456', txid, vout: 0 })
      const error = 'Only custom outputs are supported in base transactions'
      expect(() => { tx.base = base.toString('hex') }).to.throw(error)
    })
  })

  // --------------------------------------------------------------------------
  // Misc
  // --------------------------------------------------------------------------

  describe('Misc', () => {
    it('allowed to read outside before publish', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { g () { return this.n } }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      a.g()
      tx.publish()
      a.g()
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('allowed to read after export', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { g () { return this.n } }
      const tx = new Transaction()
      const a = tx.update(() => new A())
      a.g()
      const promise = tx.export()
      a.g()
      await promise
      a.g()
      tx.publish()
      await a.sync()
    })

    // ------------------------------------------------------------------------

    it('satoshi output is minimum of dust amount and jig satoshis', async () => {
      const dustAmount = Math.ceil(bsv.Transaction.DUST_AMOUNT * bsv.Transaction.FEE_PER_KB / 1000)
      const run = new Run()
      class A extends Jig { init (satoshis) { this.satoshis = satoshis } }
      run.deploy(A)

      const tx = new Run.Transaction()
      const [a, b, c] = tx.update(() => {
        return [
          new A(0),
          new A(dustAmount - 1),
          new A(dustAmount + 1)
        ]
      })

      const rawtx = await tx.export()
      const bsvtx = new bsv.Transaction(rawtx)
      expect(bsvtx.outputs[1].satoshis).to.equal(dustAmount)
      expect(bsvtx.outputs[2].satoshis).to.equal(dustAmount)
      expect(bsvtx.outputs[3].satoshis).to.equal(dustAmount + 1)

      await tx.publish()

      await run.load(a.location)
      await run.load(b.location)
      await run.load(c.location)

      run.cache = new LocalCache()
      await run.load(a.location)
      await run.load(b.location)
      await run.load(c.location)
    })

    // ------------------------------------------------------------------------

    it('raise dust amount ok', async () => {
      const oldFeePerKb = bsv.Transaction.FEE_PER_KB
      const oldDustAmount = Math.ceil(bsv.Transaction.DUST_AMOUNT * bsv.Transaction.FEE_PER_KB / 1000)
      try {
        const run = new Run()
        class A extends Jig { init (satoshis) { this.satoshis = satoshis } }
        run.deploy(A)

        const tx = new Run.Transaction()
        const [a, b, c] = tx.update(() => {
          return [
            new A(0),
            new A(oldDustAmount - 1),
            new A(oldDustAmount + 1)
          ]
        })
        await tx.publish()

        bsv.Transaction.FEE_PER_KB += 1

        await run.load(a.location)
        await run.load(b.location)
        await run.load(c.location)

        run.cache = new LocalCache()
        await run.load(a.location)
        await run.load(b.location)
        await run.load(c.location)
      } finally {
        bsv.Transaction.FEE_PER_KB = oldFeePerKb
      }
    })

    // ------------------------------------------------------------------------

    it('lower dust amount ok', async () => {
      const oldFeePerKb = bsv.Transaction.FEE_PER_KB
      const oldDustAmount = Math.ceil(bsv.Transaction.DUST_AMOUNT * bsv.Transaction.FEE_PER_KB / 1000)
      try {
        const run = new Run()
        class A extends Jig { init (satoshis) { this.satoshis = satoshis } }
        run.deploy(A)

        const tx = new Run.Transaction()
        const [a, b, c] = tx.update(() => {
          return [
            new A(0),
            new A(oldDustAmount - 1),
            new A(oldDustAmount + 1)
          ]
        })
        await tx.publish()

        bsv.Transaction.FEE_PER_KB -= 1

        await run.load(a.location)
        await run.load(b.location)
        await run.load(c.location)

        run.cache = new LocalCache()
        await run.load(a.location)
        await run.load(b.location)
        await run.load(c.location)
      } finally {
        bsv.Transaction.FEE_PER_KB = oldFeePerKb
      }
    })

    // ------------------------------------------------------------------------

    it('atomic swap with by changing run owner', async () => {
      const alice = new bsv.PrivateKey()
      const bob = new bsv.PrivateKey()

      const run = new Run({ owner: alice })
      class A extends Jig { send (owner) { this.owner = owner } }
      const a = new A()
      await a.sync()

      run.owner = bob
      const b = new A()
      await b.sync()

      const tx = new Run.Transaction()
      tx.update(() => a.send(bob.publicKey.toString()))
      tx.update(() => b.send(alice.publicKey.toString()))
      await tx.pay()
      await tx.sign()
      run.owner = alice
      await tx.sign()
      await tx.publish()

      expect(a.owner).to.equal(bob.publicKey.toString())
      expect(b.owner).to.equal(alice.publicKey.toString())
    })

    // ------------------------------------------------------------------------

    it('atomic swap with export and import', async () => {
      const aliceRun = new Run()
      const bobRun = new Run()

      class A extends Jig { send (owner) { this.owner = owner } }
      const a = new A()
      await a.sync()

      bobRun.activate()
      const b = new A()
      await b.sync()

      const tx = new Run.Transaction()
      tx.update(() => a.send(bobRun.owner.pubkey))
      tx.update(() => b.send(aliceRun.owner.pubkey))
      await tx.pay()
      await tx.sign()
      const rawtx = await tx.export()

      aliceRun.activate()
      const tx2 = await aliceRun.import(rawtx)
      await tx2.sign()
      await tx2.publish()

      expect(tx2.outputs[0].owner).to.equal(bobRun.owner.pubkey)
      expect(tx2.outputs[1].owner).to.equal(aliceRun.owner.pubkey)
    })

    // ------------------------------------------------------------------------

    if (STRESS) {
      it('many open transactions', async () => {
        const run = new Run()
        for (let i = 0; i < 1000; i++) {
          class A extends Jig { }
          const tx = new Transaction()
          tx.update(() => new A())
        }
        await run.sync()
      })
    }
  })
})

// ------------------------------------------------------------------------------------------------
