/**
 * nft.js
 *
 * Tests for lib/extra/nft.js
 */

const { describe, it, beforeEach, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { assert, expect } = require('chai')
const { PrivateKey } = require('bsv')
const Run = require('../env/run')
const { COVER } = require('../env/config')
const { createTestExtrasRun } = require('../env/misc')
const { NFT } = Run.extra.test

// ------------------------------------------------------------------------------------------------
// NFT
// ------------------------------------------------------------------------------------------------

describe('NFT', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // mint
  // --------------------------------------------------------------------------

  describe('mint()', () => {
    let nftCode
    beforeEach(async () => {
      const run = await createTestExtrasRun()
      class TestNFT extends NFT { }
      nftCode = await run.deploy(TestNFT)
    })

    it('mints to self', async () => {
      const token = nftCode.mint()
      await token.sync()

      assert.equal(token.owner, nftCode.owner)
    })

    it('mints to given owner', async () => {
      const address = new PrivateKey().toAddress().toString()
      const token = nftCode.mint(address)
      await token.sync()

      assert.equal(token.owner, address)
    })

    it('updates supply', async () => {
      const token1 = nftCode.mint()
      const token2 = nftCode.mint()
      const token3 = nftCode.mint()

      await token1.sync()
      await token2.sync()
      await token3.sync()

      assert.equal(token1.number, 1)
      assert.equal(token2.number, 2)
      assert.equal(token3.number, 3)
      assert.equal(nftCode.supply, 3)
    })

    it('throws when using constructor', async () => {
      class TestNFT2 extends NFT { }
      assert.throws(() => new TestNFT2(), 'Must create token using mint()')
    })

    it('with metadata', () => {
      const token1 = nftCode.mint(undefined, { name: '123' })
      expect(token1.metadata.name).to.equal('123')
    })

    if (!COVER) {
      it('throws if class is not extended', async () => {
        assert.throws(() => NFT.mint(), 'NFT must be extended')
      })
    }
  })

  // --------------------------------------------------------------------------
  // send
  // --------------------------------------------------------------------------

  describe('send()', () => {
    let nftCode, nft, run
    beforeEach(async () => {
      class TestNFT extends NFT { }
      run = await createTestExtrasRun()
      nftCode = await run.deploy(TestNFT)
      nft = nftCode.mint()
      await nft.sync()
    })

    it('sends to new owner', async () => {
      const address = new PrivateKey().toAddress().toString()
      nft.send(address)
      await nft.sync()
      assert.equal(nft.owner, address)
      assert.equal(nft.sender, nftCode.owner)
    })

    it('sends to custom lock', async () => {
      const LockCode = await run.deploy(class CustomLock {
        script () { return '' }
        domain () { return 0 }
      })
      nft.send(new LockCode())
      await nft.sync()
      assert.instanceOf(nft.owner, LockCode)
    })

    it('throws if send to bad owner', async () => {
      assert.throws(() => nft.send(10), 'Invalid owner: 10')
      assert.throws(() => nft.send('abc'), 'Invalid owner: "abc"')
    })
  })
})
