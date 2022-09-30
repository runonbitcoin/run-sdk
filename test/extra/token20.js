/**
 * token20.js
 *
 * Tests for lib/extra/token20.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const { PrivateKey } = require('bsv')
const Run = require('../env/run')
const { COVER, STRESS } = require('../env/config')
const { createTestExtrasRun, createTestExtrasCache } = require('../env/misc')
const { Token } = Run.extra.test

// ------------------------------------------------------------------------------------------------
// Token20
// ------------------------------------------------------------------------------------------------

describe('Token20', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // mint
  // --------------------------------------------------------------------------

  describe('mint', () => {
    it('new tokens', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(100)
      await token.sync()
      expect(token.amount).to.equal(100)
      expect(token.owner).to.equal(TestToken.owner)
    })

    // ------------------------------------------------------------------------

    it('new tokens with custom owner', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      const token = TestToken.mint(100, address)
      await token.sync()
      expect(token.amount).to.equal(100)
      expect(token.owner).to.equal(address)
    })

    // ------------------------------------------------------------------------

    it('updates supply', async () => {
      const run = await createTestExtrasRun()
      const TestToken = run.deploy(class TestToken extends Token { })
      TestToken.mint(100)
      TestToken.mint(200)
      TestToken.mint(300)
      expect(TestToken.supply).to.equal(600)
    })

    // ------------------------------------------------------------------------

    if (!COVER) {
      it('throws if class is not extended', async () => {
        await createTestExtrasRun()
        expect(() => Token.mint(100)).to.throw('Token must be extended')
      })
    }

    // ------------------------------------------------------------------------

    it('large amounts', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      expect(TestToken.mint(2147483647).amount).to.equal(2147483647)
      expect(TestToken.mint(Number.MAX_SAFE_INTEGER).amount).to.equal(Number.MAX_SAFE_INTEGER)
    })

    // ------------------------------------------------------------------------

    it('throws for bad amounts', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      expect(() => TestToken.mint()).to.throw('amount is not a number')
      expect(() => TestToken.mint('1')).to.throw('amount is not a number')
      expect(() => TestToken.mint(0)).to.throw('amount must be positive')
      expect(() => TestToken.mint(-1)).to.throw('amount must be positive')
      expect(() => TestToken.mint(Number.MAX_SAFE_INTEGER + 1)).to.throw('amount too large')
      expect(() => TestToken.mint(1.5)).to.throw('amount must be an integer')
      expect(() => TestToken.mint(Infinity)).to.throw('amount must be an integer')
      expect(() => TestToken.mint(NaN)).to.throw('amount must be an integer')
    })

    // ------------------------------------------------------------------------

    it('throws if try to fake class', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      await run.sync()

      const run2 = await createTestExtrasRun()
      class HackToken extends TestToken { }
      run2.deploy(HackToken)
      await expect(run2.sync()).to.be.rejectedWith('Missing signature for TestToken')
    })

    // ------------------------------------------------------------------------

    it('sender is null', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(1)
      await run.sync()
      expect(token.sender).to.equal(null)
      if (COVER) return
      const token2 = await run.load(token.location)
      expect(token2.sender).to.equal(null)
      run.cache = await createTestExtrasCache()
      const token3 = await run.load(token.location)
      expect(token3.sender).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('throws if create using constructor', async () => {
      await createTestExtrasRun()
      class TestToken extends Token { }
      expect(() => new TestToken(1)).to.throw('Must create token using mint()')
    })
  })

  // --------------------------------------------------------------------------
  // send
  // --------------------------------------------------------------------------

  describe('send', () => {
    it('full amount', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      const token = TestToken.mint(100)
      await token.sync()
      const sent = token.send(address)
      await sent.sync()
      expect(sent.owner).to.equal(address)
      expect(sent.amount).to.equal(100)
      expect(token.owner).to.equal(null)
      expect(token.amount).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('partial amount', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      const token = TestToken.mint(100)
      await token.sync()
      const sent = token.send(address, 30)
      await run.sync()
      expect(token.owner).to.equal(run.owner.address)
      expect(token.amount).to.equal(70)
      expect(sent).to.be.instanceOf(TestToken)
      expect(sent.owner).to.equal(address)
      expect(sent.amount).to.equal(30)
    })

    // ------------------------------------------------------------------------

    it('throws if send too much', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      const token = TestToken.mint(100)
      expect(() => token.send(address, 101)).to.throw('Not enough funds')
    })

    // ------------------------------------------------------------------------

    it('throws if send bad amount', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      const token = TestToken.mint(100)
      expect(() => token.send(address, {})).to.throw('amount is not a number')
      expect(() => token.send(address, '1')).to.throw('amount is not a number')
      expect(() => token.send(address, 0)).to.throw('amount must be positive')
      expect(() => token.send(address, -1)).to.throw('amount must be positive')
      expect(() => token.send(address, Number.MAX_SAFE_INTEGER + 1)).to.throw('amount too large')
      expect(() => token.send(address, 1.5)).to.throw('amount must be an integer')
      expect(() => token.send(address, Infinity)).to.throw('amount must be an integer')
      expect(() => token.send(address, NaN)).to.throw('amount must be an integer')
    })

    // ------------------------------------------------------------------------

    it('throws if send to bad owner', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(100)
      await token.sync()
      expect(() => token.send(10)).to.throw('Invalid owner: 10')
      expect(() => token.send('abc', 10)).to.throw('Invalid owner: "abc"')
    })

    // ------------------------------------------------------------------------

    it('sender on sent token is sending owner', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const sender = TestToken.mint(2)
      await sender.sync()
      const sent = sender.send(run.purse.address, 1)
      expect(sent.sender).to.equal(sender.owner)
      await sent.sync()
      if (COVER) return
      const sent2 = await run.load(sent.location)
      expect(sent2.sender).to.equal(sender.owner)
      run.cache = await createTestExtrasCache()
      const sent3 = await run.load(sent.location)
      expect(sent3.sender).to.equal(sender.owner)
    })

    // ------------------------------------------------------------------------

    it('sender on sending token is null', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const orig = TestToken.mint(2)
      await orig.sync()
      const sender = orig.send(run.owner.address, 1)
      await sender.sync()
      sender.send(run.purse.address, 1)
      expect(sender.sender).to.equal(null)
      await sender.sync()
      if (COVER) return
      const sender2 = await run.load(sender.location)
      expect(sender2.sender).to.equal(null)
      run.cache = await createTestExtrasCache()
      const sender3 = await run.load(sender.location)
      expect(sender3.sender).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('custom lock', async () => {
      const run = await createTestExtrasRun()
      const CustomLock = await run.deploy(class CustomLock {
        script () { return '' }
        domain () { return 0 }
      }).sync()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(2)
      await a.sync()
      const b = a.send(new CustomLock())
      await run.sync()
      expect(b.owner instanceof CustomLock).to.equal(true)
      await b.sync()
      if (COVER) return
      run.cache = await createTestExtrasCache()
      const b2 = await run.load(b.location)
      expect(b2.owner instanceof CustomLock).to.equal(true)
    })
  })

  // --------------------------------------------------------------------------
  // combine
  // --------------------------------------------------------------------------

  describe('combine', () => {
    it('two tokens', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(30)
      const b = TestToken.mint(70)
      expect(a.combine(b)).to.equal(a)
      await run.sync()
      expect(a.amount).to.equal(100)
      expect(a.owner).to.equal(run.owner.address)
      expect(b.amount).to.equal(0)
      expect(b.owner).not.to.equal(run.owner.address)
      expect(b.location.endsWith('_d0')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('many tokens', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const tokens = []
      for (let i = 0; i < 10; ++i) tokens.push(TestToken.mint(1))
      const combined = tokens[0].combine(...tokens.slice(1))
      await combined.sync()
      expect(combined).to.be.instanceOf(TestToken)
      expect(combined.amount).to.equal(10)
      expect(combined.owner).to.equal(run.owner.address)
      tokens.forEach(token => {
        if (token === combined) return
        expect(token.amount).to.equal(0)
        expect(token.owner).not.to.equal(run.owner.address)
      })
    })

    // ------------------------------------------------------------------------

    // load() does not work in cover mode for preinstalls
    it('load after combine', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(30)
      const b = TestToken.mint(70)
      a.combine(b)
      await run.sync()
      if (COVER) return
      run.cache = await createTestExtrasCache()
      const a2 = await run.load(a.location)
      expect(a2.amount).to.equal(a.amount)
    })

    // ------------------------------------------------------------------------

    it('empty', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(1)
      await a.sync()
      expect(a.combine()).to.equal(a)
      expect(a.combine().amount).to.equal(1)
      expect(a.combine().nonce).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('throws if combine different owners without signatures', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(1)
      const b = TestToken.mint(2)
      const address = new PrivateKey().toAddress().toString()
      await b.sync()
      b.send(address)
      await expect(a.combine(b).sync()).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('throws if combined amount is too large', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(Number.MAX_SAFE_INTEGER)
      const b = TestToken.mint(1)
      expect(() => a.combine(b)).to.throw('amount too large')
    })

    // ------------------------------------------------------------------------

    it('throws if combine non-tokens', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const error = 'Cannot combine different token classes'
      expect(() => TestToken.mint(1).combine(1)).to.throw(error)
      expect(() => TestToken.mint(1).combine({})).to.throw(error)
      expect(() => TestToken.mint(1).combine(TestToken.mint(1), {})).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if combine different token classes', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const error = 'Cannot combine different token classes'
      class DifferentToken extends Token { }
      run.deploy(DifferentToken)
      class ExtendedToken extends TestToken { }
      run.deploy(ExtendedToken)
      expect(() => TestToken.mint(1).combine(DifferentToken.mint(1))).to.throw(error)
      expect(() => TestToken.mint(1).combine(ExtendedToken.mint(1))).to.throw(error)
    })

    // ------------------------------------------------------------------------

    it('throws if combine duplicate tokens', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(1)
      expect(() => token.combine(token)).to.throw('Cannot combine duplicate tokens')
    })

    // ------------------------------------------------------------------------

    it('sender on combined token is null', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(2)
      const b = TestToken.mint(2)
      await run.sync()
      const c = b.send(run.owner.address, 1)
      const combined = a.combine(b, c)
      await combined.sync()
      expect(combined.sender).to.equal(null)
      if (COVER) return
      const combined2 = await run.load(combined.location)
      expect(combined2.sender).to.equal(null)
      run.cache = await createTestExtrasCache()
      const combined3 = await run.load(combined.location)
      expect(combined3.sender).to.equal(null)
    })
  })

  // --------------------------------------------------------------------------
  // destroy
  // --------------------------------------------------------------------------

  describe('destroy', () => {
    it('amount is 0', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(2)
      expect(token.amount).to.equal(2)
      token.destroy()
      expect(token.amount).to.equal(0)
      await run.sync()
      if (COVER) return
      run.cache = await createTestExtrasCache()
      const token2 = await run.load(token.location)
      expect(token2.amount).to.equal(0)
      const token3 = await run.load(token.location)
      expect(token3.amount).to.equal(0)
    })

    // ------------------------------------------------------------------------

    it('sender is null', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const token = TestToken.mint(2)
      await token.sync()
      const sent = token.send(run.owner.address, 1)
      expect(token.sender).to.equal(null)
      expect(sent.sender).to.equal(run.owner.address)
      token.destroy()
      expect(token.sender).to.equal(null)
      await run.sync()
      if (COVER) return
      run.cache = await createTestExtrasCache()
      const token2 = await run.load(token.location)
      expect(token2.sender).to.equal(null)
      const token3 = await run.load(token.location)
      expect(token3.sender).to.equal(null)
    })

    // ------------------------------------------------------------------------

    it('cannot be combined', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(2)
      a.destroy()
      const b = TestToken.mint(2)
      a.combine(b)
      await expect(a.sync()).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('cannot be sent', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(2)
      a.destroy()
      expect(() => a.send(run.owner.address)).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // Batch
  // --------------------------------------------------------------------------

  describe('Batch', () => {
    it('combine and send', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(2)
      const b = TestToken.mint(3)
      await run.sync()
      const address = new PrivateKey().toAddress().toString()
      const c = run.transaction(() => a.combine(b).send(address, 4))
      function test (a, b, c) {
        expect(a.amount).to.equal(1)
        expect(a.owner).to.equal(run.owner.address)
        expect(b.amount).to.equal(0)
        expect(b.owner).to.equal(null)
        expect(c.amount).to.equal(4)
        expect(c.owner).to.equal(address)
      }
      test(a, b, c)
      await run.sync()
      if (COVER) return
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      const c2 = await run.load(c.location)
      test(a2, b2, c2)
      run.cache = await createTestExtrasCache()
      const a3 = await run.load(a.location)
      const b3 = await run.load(b.location)
      const c3 = await run.load(c.location)
      test(a3, b3, c3)
    })

    // ------------------------------------------------------------------------

    it('send multiple', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const a = TestToken.mint(6)
      await a.sync()
      const address = new PrivateKey().toAddress().toString()
      const [b, c] = run.transaction(() => [a.send(address, 2), a.send(address, 3)])
      function test (a, b, c) {
        expect(a.amount).to.equal(1)
        expect(a.owner).to.equal(run.owner.address)
        expect(b.amount).to.equal(2)
        expect(b.owner).to.equal(address)
        expect(c.amount).to.equal(3)
        expect(c.owner).to.equal(address)
      }
      test(a, b, c)
      await run.sync()
      if (COVER) return
      const a2 = await run.load(a.location)
      const b2 = await run.load(b.location)
      const c2 = await run.load(c.location)
      test(a2, b2, c2)
      run.cache = await createTestExtrasCache()
      const a3 = await run.load(a.location)
      const b3 = await run.load(b.location)
      const c3 = await run.load(c.location)
      test(a3, b3, c3)
    })

    // ------------------------------------------------------------------------

    it('mint multiple', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      const TestTokenCode = run.deploy(TestToken)
      run.transaction(() => {
        TestTokenCode.mint(100)
        TestTokenCode.mint(200)
        TestTokenCode.mint(300)
      })
      await run.sync()
      function test (C) {
        expect(C.nonce).to.equal(2)
        expect(C.supply).to.equal(600)
      }
      test(TestTokenCode)
      if (COVER) return
      const TestToken2 = await run.load(TestTokenCode.location)
      await TestToken2.sync()
      test(TestToken2)
      run.cache = await createTestExtrasCache()
      const TestToken3 = await run.load(TestToken2.location)
      await TestToken3.sync()
      test(TestToken3)
    })

    // ------------------------------------------------------------------------

    it('throws if mint and send', async () => {
      const run = await createTestExtrasRun()
      class TestToken extends Token { }
      run.deploy(TestToken)
      const address = new PrivateKey().toAddress().toString()
      expect(() => run.transaction(() => TestToken.mint(100).send(address, 5))).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // Stress
  // --------------------------------------------------------------------------

  if (STRESS) {
    describe('Stress', () => {
      if (!COVER) {
        it('many sends', async () => {
          const a = new Run()
          a.timeout = 500000
          const b = new Run()
          b.timeout = 500000
          class TestToken extends Token { }
          const TT = b.deploy(TestToken)
          await b.sync()

          // B mints tokens
          for (let i = 0; i < 20; i++) {
            const token = TT.mint(10)
            await token.sync()

            Run.instance.blockchain.block()
          }

          // B sends to A and back again in a loop
          for (let i = 0; i < 20; i++) {
            b.activate()
            await b.inventory.sync()
            b.inventory.jigs.forEach(jig => jig.send(a.owner.pubkey))
            await b.sync()

            a.activate()
            await a.inventory.sync()
            a.inventory.jigs.forEach(jig => jig.send(b.owner.pubkey))
            await a.sync()

            Run.instance.blockchain.block()
          }

          // Loading from scratch
          b.activate()
          b.cache = await createTestExtrasCache()
          await b.inventory.sync()
        })
      }
    })
  }
})

// ------------------------------------------------------------------------------------------------
