/**
 * invalid.js
 *
 * Tests to ensure that invalid transactions are not loaded
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { _calculateDust } = unmangle(unmangle(Run)._bsv)

// ------------------------------------------------------------------------------------------------
// Invalid
// ------------------------------------------------------------------------------------------------

describe('Invalid', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // metadata
  // --------------------------------------------------------------------------

  describe('metadata', () => {
    it('throws if no metadata', async () => {
      const run = new Run()
      const bsvtx = new bsv.Transaction()
      const rawtx = bsvtx.toString('hex')
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid OP_RETURN protocol')
    })

    // ------------------------------------------------------------------------

    it('throws if empty metadata', async () => {
      const run = new Run()
      const rawtx = createRunTransaction({ metadata: {} })
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid RUN metadata')
    })

    // ------------------------------------------------------------------------

    it('throws if no exec statements', async () => {
      const run = new Run()
      const rawtx = createRunTransaction({
        metadata: { in: 0, ref: [], out: [], del: [], cre: [], exec: [] },
        outputs: [{ script: '', satoshis: 1000 }]
      })
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid metadata: no commit generated')
    })

    // ------------------------------------------------------------------------

    it('throws if exec statement missing op', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      delete config.metadata.exec[0].op
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid exec')
    })

    // ------------------------------------------------------------------------

    it('throws if exec statement missing data', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      delete config.metadata.exec[0].data
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid exec')
    })

    // ------------------------------------------------------------------------

    it('throws if exec statement contains extra fields', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].name = 'alice'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid exec')
    })

    // ------------------------------------------------------------------------

    it('throws if unknown exec op', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].op = 'SHUTDOWN'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Unknown op: SHUTDOWN')
    })

    // ------------------------------------------------------------------------

    it('throws if exec op has bad format', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].op = 'deploy'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Unknown op: deploy')
    })

    // ------------------------------------------------------------------------

    it('throws if extra fields', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.author = 'alice'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid RUN metadata')
    })
  })

  // --------------------------------------------------------------------------
  // op_return
  // --------------------------------------------------------------------------

  describe('op_return', () => {
    it('throws if not a run prefix', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.prefix = 'slp'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid OP_RETURN protocol')
    })

    // ------------------------------------------------------------------------

    it('throws if unsupported version', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.version = '04'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Unsupported RUN transaction version: 04')
    })

    // ------------------------------------------------------------------------

    it('throws if extra data', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.extraData = 'abc'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid OP_RETURN protocol')
    })
  })

  // --------------------------------------------------------------------------
  // output
  // --------------------------------------------------------------------------

  describe('outputs', () => {
    it('throws if invalid output script for address', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.outputs[0].script = ''
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Script mismatch on output 1')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid output script for custom lock', async () => {
      const run = new Run()
      const config = buildDeployWithCustomLockConfig()
      config.outputs[0].script = 'bb'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Script mismatch on output 1')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid output satoshis', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx, 1000)
      instantiateConfig.outputs[0].satoshis = 999
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Satoshis mismatch on output 1')
    })

    // ------------------------------------------------------------------------

    it('throws if missing output', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.outputs = []
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Jig output missing for _o1')
    })
  })

  // --------------------------------------------------------------------------
  // inputs
  // --------------------------------------------------------------------------

  describe('inputs', () => {
    it('throws if missing input', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.inputs = []
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Jig input missing for _i0')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid input', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.inputs[0].vout = 0
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Jig not found')
    })
  })

  // --------------------------------------------------------------------------
  // in
  // --------------------------------------------------------------------------

  describe('in', () => {
    it('throws if invalid in', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.in = [1]
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Not a RUN transaction: invalid RUN metadata')
    })

    // ------------------------------------------------------------------------

    it('throws if in too low', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.in = 0
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":0}"')
    })
  })

  // --------------------------------------------------------------------------
  // cre
  // --------------------------------------------------------------------------

  describe('cre', () => {
    it('throws if missing cre entry', async () => {
      const run = new Run()
      const config = buildDeployAndInstantiateConfig()
      config.metadata.cre.length = 1
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid number of cre entries')
    })

    // ------------------------------------------------------------------------

    it('throws if cre owner too short', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.cre[0] = 'abc'
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid owner: "abc"')
    })

    // ------------------------------------------------------------------------

    it('throws if cre owner is number', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.cre[0] = 123
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid owner: 123')
    })

    // ------------------------------------------------------------------------

    it('throws if owner mismatch', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const address = new bsv.PrivateKey().toAddress().toString()
      const instantiateConfig = buildInstantiateConfig(deployRawtx, 0, address)
      expect(instantiateConfig.metadata.cre[0]).to.equal(address)
      instantiateConfig.metadata.cre[0] = new bsv.PrivateKey().toAddress().toString()
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Metadata mismatch')
    })
  })

  // --------------------------------------------------------------------------
  // out
  // --------------------------------------------------------------------------

  describe('out', () => {
    it('throws if incorrect out hash', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.out = ['0000000000000000000000000000000000000000000000000000000000000000']
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Metadata mismatch')
    })

    // ------------------------------------------------------------------------

    it('throws if missing out hash', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.out = []
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Metadata mismatch')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid out hash', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.out = [null]
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Not a RUN transaction: invalid RUN metadata')
    })
  })

  // --------------------------------------------------------------------------
  // del
  // --------------------------------------------------------------------------

  describe('del', () => {
    it('throws if incorrect del hash', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const destroyConfig = buildDestroyConfig(deployRawtx)
      destroyConfig.metadata.del = ['1111111111111111111111111111111111111111111111111111111111111111']
      const destroyRawtx = createRunTransaction(destroyConfig)
      await expect(run.import(destroyRawtx)).to.be.rejectedWith('Metadata mismatch')
    })

    // ------------------------------------------------------------------------

    it('throws if missing del hash', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const destroyConfig = buildDestroyConfig(deployRawtx)
      destroyConfig.metadata.del = []
      const destroyRawtx = createRunTransaction(destroyConfig)
      await expect(run.import(destroyRawtx)).to.be.rejectedWith('Metadata mismatch')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid del hash', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const destroyConfig = buildDestroyConfig(deployRawtx)
      destroyConfig.metadata.del = [{}]
      const destroyRawtx = createRunTransaction(destroyConfig)
      await expect(run.import(destroyRawtx)).to.be.rejectedWith('Not a RUN transaction: invalid RUN metadata')
    })
  })

  // --------------------------------------------------------------------------
  // ref
  // --------------------------------------------------------------------------

  describe('ref', () => {
    it('throws if duplicate native ref', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.ref = ['native://Jig', 'native://Jig']
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Inconsistent reference: Jig')
    })

    // ------------------------------------------------------------------------

    it('throws if duplicate class ref', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.ref.push(instantiateConfig.metadata.ref[0])
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Inconsistent reference: A')
    })

    // ------------------------------------------------------------------------

    it('throws if ref same as input', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.ref = [`${deployTxid}_o1`]
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Inconsistent reference: A')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid native ref', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.ref = ['native://jig']
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Native code not found: jig')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid class ref', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.ref = ['abc']
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Bad location: "abc"')
    })
  })

  // --------------------------------------------------------------------------
  // new
  // --------------------------------------------------------------------------

  describe('new', () => {
    it('throws if missing output new target', async () => {
      const run = new Run()
      const config = buildDeployAndInstantiateConfig()
      config.metadata.exec[1].data[0].$jig = 2
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Cannot decode "{"$jig":2}"')
    })

    // ------------------------------------------------------------------------

    it('throws if missing ref new target', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.ref = []
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":0}"')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid new args', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.exec[0].data[1] = {}
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('NEW args must be an array')
    })

    // ------------------------------------------------------------------------

    it('throws if NEW on jig', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      const instantiateTxid = new bsv.Transaction(instantiateRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : txid === instantiateTxid ? instantiateRawtx : undefined
      const instantiateConfig2 = buildInstantiateConfig(instantiateRawtx)
      const instantiateRawtx2 = createRunTransaction(instantiateConfig2)
      await expect(run.import(instantiateRawtx2)).to.be.rejectedWith('Must only execute NEW on code')
    })

    // ------------------------------------------------------------------------

    it('throws if NEW on sidekick class', async () => {
      const run = new Run()
      const deployConfig = buildDeploySidekickConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Must only execute NEW on a jig class')
    })

    // ------------------------------------------------------------------------

    it('throws if missing new args ref', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.exec[0].data[1] = [0, null, { $jig: 1 }]
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":1}"')
    })

    // ------------------------------------------------------------------------

    it('throws if missing arg data', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      instantiateConfig.metadata.exec[0].data.length = 1
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Invalid NEW data length')
    })
  })

  // --------------------------------------------------------------------------
  // method
  // --------------------------------------------------------------------------

  describe('call', () => {
    it('throws if missing input call target', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[0].$jig = 1
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":1}"')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid input call target', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[0].$jig = null
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":null}"')
    })

    // ------------------------------------------------------------------------

    it('throws if call missing method', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[1] = 'g'
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot call A.g()')
    })

    // ------------------------------------------------------------------------

    it('throws if method throws', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[1] = 'err'
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejected
    })

    // ------------------------------------------------------------------------

    it('throws if invalid method args', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[2] = null
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('CALL args must be an array')
    })

    // ------------------------------------------------------------------------

    it('throws if missing method arg data', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data.length = 2
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Invalid CALL data length')
    })

    // ------------------------------------------------------------------------

    it('throws if missing method name data', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[1] = null
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('CALL method must be a string: null')
    })

    // ------------------------------------------------------------------------

    it('throws if target is a sidekick', async () => {
      const run = new Run()
      const deployConfig = buildDeploySidekickConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Must only execute CALL on jigs')
    })

    // ------------------------------------------------------------------------

    it('throws if missing method arg ref', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx)
      callConfig.metadata.exec[0].data[2] = [{ $jig: 10 }]
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":10}"')
    })

    // ------------------------------------------------------------------------

    it('throws if call upgrade', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx, 'upgrade', { $jig: 0 })
      const callRawtx = createRunTransaction(callConfig)
      await expect(run.import(callRawtx)).to.be.rejectedWith('Cannot execute upgrade() with CALL')
    })
  })

  // --------------------------------------------------------------------------
  // deploy
  // --------------------------------------------------------------------------

  describe('deploy', () => {
    it('throws if bad deploy code', async () => {
      const run = new Run()
      const config = buildDeployConfig('1 + 2 + 3')
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Bad source code')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy anonymous function', async () => {
      const run = new Run()
      const config = buildDeployConfig('() => {}')
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Bad source code')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy object then class', async () => {
      const run = new Run()
      const config = buildDeployConfig('({}, class A { })')
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Bad source code')
    })

    // ------------------------------------------------------------------------

    it('throws if multiple types in deploy src', async () => {
      const run = new Run()
      const config = buildDeployConfig('class A { }; class B extends A { }')
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Multiple definitions not permitted')
    })

    // ------------------------------------------------------------------------

    it('throws if missing class props', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data.length = 1
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid DEPLOY data length')
    })

    // ------------------------------------------------------------------------

    it('throws if extra deploy data', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data.push(null)
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid DEPLOY data length')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy data is not an array', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data = { }
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('DEPLOY data must be an array')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid src code', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data[0] = null
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('DEPLOY src must be a string')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid class props', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data[1] = [1, 2, 3]
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('DEPLOY props must be an object')
    })

    // ------------------------------------------------------------------------

    it('throws if missing class prop ref', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data[1].deps.Jig.$jig = 2
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Invalid local jig reference: 2')
    })

    // ------------------------------------------------------------------------

    it('throws if extend self', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      config.metadata.exec[0].data[1].deps.Jig.$jig = 1
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Cannot extend the self')
    })

    // ------------------------------------------------------------------------

    it('throws if deploy code with reserved method', async () => {
      const run = new Run()
      const config = buildDeployConfig('class A { static auth() { } }')
      const rawtx = createRunTransaction(config)
      await expect(run.import(rawtx)).to.be.rejectedWith('Must not have any reserved words: auth')
    })
  })

  // --------------------------------------------------------------------------
  // upgrade
  // --------------------------------------------------------------------------

  describe('upgrade', () => {
    it('throws if missing input upgrade target', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.in = 0
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":1}"')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid input upgrade target', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data[0].$jig = '_o1'
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":"_o1"}"')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid upgrade src', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data[1] = 0
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('UPGRADE src must be a string')
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade object then class', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx, '({}, class A { })')
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Bad source code')
    })

    // ------------------------------------------------------------------------

    it('throws if multiple types in upgrade src', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx, 'function f() { }; class A { }')
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Multiple definitions not permitted')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid upgrade data', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data = { src: 'class B { }', props: { deps: { } } }
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('UPGRADE data must be an array')
    })

    // ------------------------------------------------------------------------

    it('throws if extra upgrade data', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data.push('class B { }')
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Invalid UPGRADE data length')
    })

    // ------------------------------------------------------------------------

    it('throws if upgrade jig', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(deployRawtx)
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      const instantiateTxid = new bsv.Transaction(instantiateRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : txid === instantiateTxid ? instantiateRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(instantiateRawtx)
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Must only upgrade code')
    })

    // ------------------------------------------------------------------------

    it('throws if missing class props', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data.length = 2
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Invalid UPGRADE data length')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid class props', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data[2] = null
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('UPGRADE props must be an object')
    })

    // ------------------------------------------------------------------------

    it('throws if missing class prop ref', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data[2].deps.Missing = { $jig: 2 }
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Cannot decode "{"$jig":2}"')
    })

    // ------------------------------------------------------------------------

    it('throws if extend self', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const upgradeConfig = buildUpgradeConfig(deployRawtx)
      upgradeConfig.metadata.exec[0].data[2].deps.Jig = { $jig: 0 }
      const upgradeRawtx = createRunTransaction(upgradeConfig)
      await expect(run.import(upgradeRawtx)).to.be.rejectedWith('Cannot extend the self')
    })
  })

  // --------------------------------------------------------------------------
  // inconsistent worldview
  // --------------------------------------------------------------------------

  describe('inconsistent worldview', () => {
    it('throws if inconsistent refs', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const authConfig = buildAuthConfig(deployRawtx)
      const authRawtx = createRunTransaction(authConfig)
      const authTxid = new bsv.Transaction(authRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : txid === authTxid ? authRawtx : undefined
      const instantiateConfig = buildInstantiateConfig(authRawtx)
      instantiateConfig.metadata.ref.push(`${deployTxid}_o1`)
      const instantiateRawtx = createRunTransaction(instantiateConfig)
      await expect(run.import(instantiateRawtx)).to.be.rejectedWith('Inconsistent reference: A')
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent inputs', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const authConfig = buildAuthConfig(deployRawtx)
      const authRawtx = createRunTransaction(authConfig)
      const authTxid = new bsv.Transaction(authRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : txid === authTxid ? authRawtx : undefined
      const authConfig2 = buildAuthConfig(deployRawtx)
      authConfig2.inputs.push(Object.assign({}, authConfig2.inputs[0]))
      authConfig2.inputs[1].txid = authTxid
      authConfig2.metadata.in = 2
      const authRawtx2 = createRunTransaction(authConfig2)
      await expect(run.import(authRawtx2)).to.be.rejectedWith('Inconsistent reference: A')
    })

    // ------------------------------------------------------------------------

    it('throws if inconsistent ref and input', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const authConfig = buildAuthConfig(deployRawtx)
      const authRawtx = createRunTransaction(authConfig)
      const authTxid = new bsv.Transaction(authRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : txid === authTxid ? authRawtx : undefined
      const authConfig2 = buildAuthConfig(deployRawtx)
      authConfig2.metadata.ref.push(`${authTxid}_o1`)
      const authRawtx2 = createRunTransaction(authConfig2)
      await expect(run.import(authRawtx2)).to.be.rejectedWith('Inconsistent reference: A')
    })
  })

  // --------------------------------------------------------------------------
  // misc
  // --------------------------------------------------------------------------

  describe('misc', () => {
    it('throws if load payment output', async () => {
      const run = new Run()
      const config = buildDeployConfig()
      const rawtx = createRunTransaction(config)
      const txid = new bsv.Transaction(rawtx).hash
      run.blockchain.fetch = txid => rawtx
      await expect(run.load(`${txid}_o2`)).to.be.rejectedWith('Jig not found')
    })

    // ------------------------------------------------------------------------

    it('method that produces no changes is ok', async () => {
      const run = new Run()
      const deployConfig = buildDeployConfig()
      const deployRawtx = createRunTransaction(deployConfig)
      const deployTxid = new bsv.Transaction(deployRawtx).hash
      run.blockchain.fetch = txid => txid === deployTxid ? deployRawtx : undefined
      const callConfig = buildCallConfig(deployRawtx, 'noop')
      const callRawtx = createRunTransaction(callConfig)
      await run.import(callRawtx)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Manually creates a run transaction
 * @param {object} options Options object
 * @param {object} options.metadata Metadata JSON
 * @param {?string} options.prefix OP_RETURN prefix
 * @param {?string} options.version Version hex string
 * @param {?string} options.app App string
 * @param {?string} options.base Raw transaction base
 * @param {?string} options.extraData Extra data to the append to the end of the op_return
 * @param {?Array<{script,satoshis}>} options.outputs Outputs after the metadata
 * @param {?Array<{txid,vout}>} options.inputs Inputs spent
 * @returns {string} Raw transaction
 */
function createRunTransaction (options) {
  const Buffer = bsv.deps.Buffer
  const prefix = Buffer.from(options.prefix || 'run', 'utf8')
  const ver = Buffer.from([options.version || 0x05])
  const app = Buffer.from(options.app || '', 'utf8')
  const json = Buffer.from(JSON.stringify(options.metadata), 'utf8')
  const opreturnData = [prefix, ver, app, json]
  if (options.extraData) opreturnData.push(Buffer.from(options.extraData, 'utf8'))
  const script = bsv.Script.buildSafeDataOut(opreturnData)
  const opreturn = new bsv.Transaction.Output({ script, satoshis: 0 })
  const bsvtx = options.base ? new bsv.Transaction(options.base) : new bsv.Transaction()
  bsvtx.addOutput(opreturn)
  if (options.outputs) options.outputs.forEach(output => bsvtx.addOutput(new bsv.Transaction.Output(output)))
  if (options.inputs) options.inputs.forEach(input => bsvtx.from(input))
  const rawtx = bsvtx.toString('hex')
  return rawtx
}

// ------------------------------------------------------------------------------------------------

function buildDeployConfig (src = null) {
  src = src || `class A extends Jig {
    init(satoshis = 0, owner = null) { this.satoshis = satoshis; if (owner) this.owner = owner }
    static set(n) { this.n = n }
    static noop() { }
    static err() { throw new Error() }
  }`
  const address = new bsv.PrivateKey().toAddress().toString()
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_o1',
      nonce: 1,
      origin: '_o1',
      owner: address,
      satoshis: 0
    },
    src,
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 0,
      ref: ['native://Jig'],
      out: [stateHash],
      del: [],
      cre: [address],
      exec: [{ op: 'DEPLOY', data: [src, { deps: { Jig: { $jig: 0 } } }] }]
    },
    outputs: [
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildDeploySidekickConfig () {
  const src = 'class A { static set() { } }'
  const address = new bsv.PrivateKey().toAddress().toString()
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { },
      location: '_o1',
      nonce: 1,
      origin: '_o1',
      owner: address,
      satoshis: 0
    },
    src,
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 0,
      ref: [],
      out: [stateHash],
      del: [],
      cre: [address],
      exec: [{ op: 'DEPLOY', data: [src, { deps: { } }] }]
    },
    outputs: [
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildDeployWithCustomLockConfig () {
  const locksrc = 'class L { script() { return \'aa\' } domain() { return 0 } }'
  const clssrc = 'class A { }'
  const script = 'aa'
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const lockstate = {
    kind: 'code',
    props: {
      deps: { },
      location: '_o1',
      nonce: 1,
      origin: '_o1',
      owner: { $arb: {}, T: { $jig: '_o1' } },
      satoshis: 0
    },
    src: locksrc,
    version: '04'
  }
  const lockStateBuffer = bsv.deps.Buffer.from(JSON.stringify(lockstate), 'utf8')
  const lockStateHash = bsv.crypto.Hash.sha256(lockStateBuffer).toString('hex')
  const clstate = {
    kind: 'code',
    props: {
      deps: { },
      location: '_o2',
      nonce: 1,
      origin: '_o2',
      owner: { $arb: {}, T: { $jig: '_o1' } },
      satoshis: 0
    },
    src: clssrc,
    version: '04'
  }
  const clsStateBuffer = bsv.deps.Buffer.from(JSON.stringify(clstate), 'utf8')
  const clsStateHash = bsv.crypto.Hash.sha256(clsStateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 0,
      ref: [],
      out: [lockStateHash, clsStateHash],
      del: [],
      cre: [{ $arb: {}, T: { $jig: 0 } }, { $arb: {}, T: { $jig: 0 } }],
      exec: [
        { op: 'DEPLOY', data: [locksrc, { deps: { } }] },
        { op: 'DEPLOY', data: [clssrc, { deps: { } }] }
      ]
    },
    outputs: [
      { script, satoshis: dust },
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildInstantiateConfig (deployRawtx, satoshis = 0, owner = null) {
  const deployTxid = new bsv.Transaction(deployRawtx).hash
  const address = owner || new bsv.PrivateKey().toAddress().toString()
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    cls: { $jig: `${deployTxid}_o1` },
    kind: 'jig',
    props: {
      location: '_o1',
      nonce: 1,
      origin: '_o1',
      owner: address,
      satoshis
    },
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 0,
      ref: [`${deployTxid}_o1`],
      out: [stateHash],
      del: [],
      cre: [address],
      exec: [{ op: 'NEW', data: [{ $jig: 0 }, [satoshis, owner]] }]
    },
    outputs: [
      { script, satoshis: Math.max(dust, satoshis) }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildCallConfig (deployRawtx, method = 'set', arg = 1) {
  const deployMetadata = Run.util.metadata(deployRawtx)
  const deployTxid = new bsv.Transaction(deployRawtx).hash
  const address = deployMetadata.cre[0]
  const src = deployMetadata.exec[0].data[0]
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_o1',
      nonce: 2,
      origin: `${deployTxid}_o1`,
      owner: address,
      satoshis: 0
    },
    src,
    version: '04'
  }
  if (method === 'set') state.props.n = 1
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 1,
      ref: [],
      out: [stateHash],
      del: [],
      cre: [],
      exec: [{ op: 'CALL', data: [{ $jig: 0 }, method, [arg]] }]
    },
    inputs: [
      { txid: deployTxid, vout: 1, script, satoshis: dust }
    ],
    outputs: [
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildUpgradeConfig (deployRawtx, src) {
  src = src || 'class B extends Jig { }'
  const deployMetadata = Run.util.metadata(deployRawtx)
  const deployTxid = new bsv.Transaction(deployRawtx).hash
  const address = deployMetadata.cre[0]
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_o1',
      nonce: 2,
      origin: `${deployTxid}_o1`,
      owner: address,
      satoshis: 0
    },
    src,
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 1,
      ref: ['native://Jig'],
      out: [stateHash],
      del: [],
      cre: [],
      exec: [{ op: 'UPGRADE', data: [{ $jig: 0 }, src, { deps: { Jig: { $jig: 1 } } }] }]
    },
    inputs: [
      { txid: deployTxid, vout: 1, script, satoshis: dust }
    ],
    outputs: [
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildDeployAndInstantiateConfig () {
  const src = 'class A extends Jig { }'
  const address = new bsv.PrivateKey().toAddress().toString()
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const codeState = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_o1',
      nonce: 1,
      origin: '_o1',
      owner: address,
      satoshis: 0
    },
    src,
    version: '04'
  }
  const codeStateBuffer = bsv.deps.Buffer.from(JSON.stringify(codeState), 'utf8')
  const codeStateHash = bsv.crypto.Hash.sha256(codeStateBuffer).toString('hex')
  const jigState = {
    cls: { $jig: '_o1' },
    kind: 'jig',
    props: {
      location: '_o2',
      nonce: 1,
      origin: '_o2',
      owner: address,
      satoshis: 0
    },
    version: '04'
  }
  const jigStateBuffer = bsv.deps.Buffer.from(JSON.stringify(jigState), 'utf8')
  const jigStateHash = bsv.crypto.Hash.sha256(jigStateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 0,
      ref: ['native://Jig'],
      out: [codeStateHash, jigStateHash],
      del: [],
      cre: [address, address],
      exec: [
        { op: 'DEPLOY', data: [src, { deps: { Jig: { $jig: 0 } } }] },
        { op: 'NEW', data: [{ $jig: 1 }, []] }
      ]
    },
    outputs: [
      { script, satoshis: dust },
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildDestroyConfig (deployRawtx) {
  const deployMetadata = Run.util.metadata(deployRawtx)
  const deployTxid = new bsv.Transaction(deployRawtx).hash
  const address = deployMetadata.cre[0]
  const src = deployMetadata.exec[0].data[0]
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_d0',
      nonce: 2,
      origin: `${deployTxid}_o1`,
      owner: null,
      satoshis: 0
    },
    src,
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 1,
      ref: [],
      out: [],
      del: [stateHash],
      cre: [],
      exec: [{ op: 'CALL', data: [{ $jig: 0 }, 'destroy', []] }]
    },
    inputs: [
      { txid: deployTxid, vout: 1, script, satoshis: dust }
    ],
    outputs: []
  }
  return options
}

// ------------------------------------------------------------------------------------------------

function buildAuthConfig (deployRawtx) {
  const deployMetadata = Run.util.metadata(deployRawtx)
  const deployTxid = new bsv.Transaction(deployRawtx).hash
  const address = deployMetadata.cre[0]
  const src = deployMetadata.exec[0].data[0]
  const hash = new bsv.Address(address).hashBuffer.toString('hex')
  const asm = `OP_DUP OP_HASH160 ${hash} OP_EQUALVERIFY OP_CHECKSIG`
  const script = bsv.Script.fromASM(asm).toHex()
  const dust = _calculateDust(script.length / 2, bsv.Transaction.FEE_PER_KB)
  const state = {
    kind: 'code',
    props: {
      deps: { Jig: { $jig: 'native://Jig' } },
      location: '_o1',
      nonce: 2,
      origin: `${deployTxid}_o1`,
      owner: deployMetadata.cre[0],
      satoshis: 0
    },
    src,
    version: '04'
  }
  const stateBuffer = bsv.deps.Buffer.from(JSON.stringify(state), 'utf8')
  const stateHash = bsv.crypto.Hash.sha256(stateBuffer).toString('hex')
  const options = {
    metadata: {
      in: 1,
      ref: [],
      out: [stateHash],
      del: [],
      cre: [],
      exec: [{ op: 'CALL', data: [{ $jig: 0 }, 'auth', []] }]
    },
    inputs: [
      { txid: deployTxid, vout: 1, script, satoshis: dust }
    ],
    outputs: [
      { script, satoshis: dust }
    ]
  }
  return options
}

// ------------------------------------------------------------------------------------------------
