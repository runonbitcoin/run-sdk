/**
 * run.js
 *
 * Tests for lib/run.js
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { stub } = require('sinon')
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('./env/run')
const unmangle = require('./env/unmangle')
const { Jig } = Run
const {
  RunConnect, WhatsOnChain, Mockchain, LocalCache, LocalOwner, LocalPurse,
  LocalState, BrowserCache, NodeCache, Inventory, StateServer, Viewer, RunDB,
  BlockchainWrapper, StateWrapper, PurseWrapper
} = Run.plugins
const { BROWSER } = require('./env/config')
const request = unmangle(Run)._request
const Log = unmangle(unmangle(Run)._Log)

// ------------------------------------------------------------------------------------------------
// Run
// ------------------------------------------------------------------------------------------------

describe('Run', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    // ------------------------------------------------------------------------
    // api
    // ------------------------------------------------------------------------

    describe('api', () => {
      it('defaults to undefined default', () => {
        const previousDefault = Run.defaults.api
        try {
          Run.defaults.api = undefined
          expect(new Run().api).to.equal(undefined)
        } finally {
          Run.defaults.api = previousDefault
        }
      })

      // ----------------------------------------------------------------------

      it('defaults to string default', () => {
        const previousDefault = Run.defaults.api
        try {
          Run.defaults.api = 'whatsonchain'
          expect(new Run({ network: 'main' }).api).to.equal('whatsonchain')
        } finally {
          Run.defaults.api = previousDefault
        }
      })

      // ----------------------------------------------------------------------

      it('run', () => {
        expect(new Run({ api: 'run', network: 'main' }).blockchain instanceof RunConnect).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('whatsonchain', () => {
        expect(new Run({ api: 'whatsonchain', network: 'test' }).blockchain instanceof WhatsOnChain).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('throws if unsupported', () => {
        expect(() => new Run({ api: 'run', network: 'mock' })).to.throw('"mock" network is not compatible with the "run" api')
        expect(() => new Run({ api: 'run', network: 'stn' })).to.throw('RunConnect API does not support the "stn" network')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ api: 'mock' })).to.throw('Invalid api: "mock"')
        expect(() => new Run({ api: 'bad' })).to.throw('Invalid api: "bad"')
        expect(() => new Run({ api: null })).to.throw('Invalid api: null')
        expect(() => new Run({ api: 123 })).to.throw('Invalid api: 123')
        expect(() => new Run({ api: 'WhatsOnChain' })).to.throw('Invalid api: "WhatsOnChain"')
      })
    })

    // ------------------------------------------------------------------------
    // apiKey
    // ------------------------------------------------------------------------

    describe('apiKey', () => {
      it('defaults to default', () => {
        expect(new Run().apiKey).to.equal(Run.defaults.apiKey)
      })

      // ----------------------------------------------------------------------

      it('assigns api key for run', () => {
        expect(new Run({ network: 'main', api: 'whatsonchain', apiKey: 'abc' }).apiKey).to.equal('abc')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ network: 'main', api: 'whatsonchain', apiKey: null })).to.throw('Invalid apiKey: null')
      })
    })

    // ------------------------------------------------------------------------
    // app
    // ------------------------------------------------------------------------

    describe('app', () => {
      it('defaults to default', () => {
        expect(new Run().app).to.equal(Run.defaults.app)
      })

      // ----------------------------------------------------------------------

      it('custom app', () => {
        expect(new Run({ app: '' }).app).to.equal('')
        expect(new Run({ app: '123abc' }).app).to.equal('123abc')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ app: undefined })).to.throw('Invalid app: undefined')
        expect(() => new Run({ app: null })).to.throw('Invalid app: null')
        expect(() => new Run({ app: 123 })).to.throw('Invalid app: 123')
        expect(() => new Run({ app: new Map() })).to.throw('Invalid app: [object Map]')
      })
    })

    // ------------------------------------------------------------------------
    // autofund
    // ------------------------------------------------------------------------

    describe('autofund', () => {
      it('defaults to default', () => {
        expect(new Run().autofund).to.equal(Run.defaults.autofund)
      })

      // ----------------------------------------------------------------------

      it('true', async () => {
        const run = new Run({ autofund: true, network: 'mock' })
        expect(run.autofund).to.equal(true)
        expect((await run.blockchain.utxos(run.purse.address)).length > 0).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('false', async () => {
        const run = new Run({ autofund: false, network: 'mock' })
        expect(run.autofund).to.equal(false)
        expect((await run.blockchain.utxos(run.purse.address)).length > 0).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ autofund: undefined })).to.throw('Invalid autofund: undefined')
        expect(() => new Run({ autofund: null })).to.throw('Invalid autofund: null')
        expect(() => new Run({ autofund: -1 })).to.throw('Invalid autofund: -1')
        expect(() => new Run({ autofund: new Set() })).to.throw('Invalid autofund: [object Set]')
      })
    })

    // ------------------------------------------------------------------------
    // blockchain
    // ------------------------------------------------------------------------

    describe('blockchain', () => {
      it('defaults to api if main', () => {
        const run = new Run({ api: 'run', network: 'main' })
        expect(run.blockchain instanceof RunConnect).to.equal(true)
        expect(run.blockchain.api).to.equal('run')
        expect(run.blockchain.network).to.equal('main')
      })

      // ----------------------------------------------------------------------

      it('defaults to mockchain if mock', () => {
        const run = new Run({ network: 'mock' })
        expect(run.blockchain instanceof Mockchain).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('mockchain', () => {
        const blockchain = new Mockchain()
        const run = new Run({ blockchain })
        expect(run.blockchain).to.equal(blockchain)
        expect(run.network).to.equal('mock')
        expect(run.api).to.equal(undefined)
        expect(run.apiKey).to.equal(undefined)
      })

      // ----------------------------------------------------------------------

      it('run', () => {
        const blockchain = new RunConnect()
        const run = new Run({ blockchain })
        expect(run.blockchain).to.equal(blockchain)
        expect(run.network).to.equal('main')
        expect(run.api).to.equal(undefined)
        expect(run.apiKey).to.equal(undefined)
        expect(run.blockchain.api).to.equal('run')
        expect(run.blockchain.apiKey).to.equal(undefined)
      })

      // ----------------------------------------------------------------------

      it('whatsonchain', () => {
        const blockchain = new WhatsOnChain({ network: 'test', apiKey: '123' })
        const run = new Run({ blockchain })
        expect(run.blockchain).to.equal(blockchain)
        expect(run.network).to.equal('test')
        expect(run.api).to.equal(undefined)
        expect(run.apiKey).to.equal(undefined)
        expect(run.blockchain.api).to.equal('whatsonchain')
        expect(run.blockchain.apiKey).to.equal('123')
      })

      // ----------------------------------------------------------------------

      it('custom', () => {
        let fetched = false
        const blockchain = {
          network: 'main',
          broadcast: async () => {},
          fetch: async () => { fetched = true },
          utxos: async () => {},
          time: async () => 0,
          spends: async () => null
        }
        const run = new Run({ blockchain })
        run.blockchain.fetch()
        expect(fetched).to.equal(true)
        expect(run.blockchain).to.equal(blockchain)
      })

      // ----------------------------------------------------------------------

      it('defaults to default', () => {
        const defaultBlockchain = Run.defaults.blockchain
        const defaultNetwork = Run.defaults.network
        Run.defaults.blockchain = new WhatsOnChain()
        Run.defaults.network = undefined
        expect(new Run().blockchain).to.equal(Run.defaults.blockchain)
        Run.defaults.blockchain = defaultBlockchain
        Run.defaults.network = defaultNetwork
      })

      // ----------------------------------------------------------------------

      it('sets cache if blockchain wrapper', () => {
        const blockchain = new Mockchain()
        const run = new Run({ blockchain })
        expect(run.blockchain.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('resuses mockchain', () => {
        const run = new Run({ network: 'mock' })
        const run2 = new Run({ network: 'mock' })
        expect(run.blockchain).to.equal(run2.blockchain)
      })

      // ----------------------------------------------------------------------

      it('resuses blockchain if same api, apiKey, and network', () => {
        const run = new Run({ api: 'whatsonchain', apiKey: 'abc', network: 'test' })
        const run2 = new Run({ api: 'whatsonchain', apiKey: 'abc', network: 'test' })
        expect(run.blockchain).to.equal(run2.blockchain)
      })

      // ----------------------------------------------------------------------

      it('does not reuse blockchain if different apis', () => {
        const run = new Run({ ap: 'run' })
        const run2 = new Run({ api: 'whatsonchain', apiKey: 'abc', network: 'main' })
        expect(run.blockchain).not.to.equal(run2.blockchain)
      })

      // ----------------------------------------------------------------------

      it('does not reuse blockchain if different api keys', () => {
        const run = new Run({ api: 'whatsonchain', apiKey: 'abc', network: 'main' })
        const run2 = new Run({ api: 'whatsonchain', apiKey: 'def', network: 'main' })
        expect(run.blockchain).not.to.equal(run2.blockchain)
      })

      // ----------------------------------------------------------------------

      it('does not reuse blockchain if different networks', () => {
        const run = new Run({ api: 'run', network: 'main' })
        const run2 = new Run({ api: 'run', network: 'test' })
        expect(run.blockchain).not.to.equal(run2.blockchain)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ blockchain: undefined })).to.throw('Invalid blockchain: undefined')
        expect(() => new Run({ blockchain: null })).to.throw('Invalid blockchain: null')
        expect(() => new Run({ blockchain: 123 })).to.throw('Invalid blockchain: 123')
        expect(() => new Run({ blockchain: false })).to.throw('Invalid blockchain: false')
        expect(() => new Run({ blockchain: () => {} })).to.throw('Invalid blockchain: [anonymous function]')
        const blockchain = {
          network: 'main',
          broadcast: async () => {},
          fetch: async () => { },
          time: async () => 0,
          spends: async () => null
        }
        expect(() => new Run({ blockchain })).to.throw('Invalid blockchain: [object Object]')
      })

      // ----------------------------------------------------------------------

      it('throws if incompatible settings', () => {
        expect(() => new Run({ blockchain: new Mockchain(), api: 'run' })).to.throw('Blockchain mismatch with "run" api')
        expect(() => new Run({ blockchain: new Mockchain(), apiKey: 'abc' })).to.throw('Blockchain mismatch with "abc" apiKey')
        expect(() => new Run({ blockchain: new Mockchain(), network: 'main' })).to.throw('Blockchain mismatch with "main" network')
        expect(() => new Run({ blockchain: new RunConnect(), network: 'mock' })).to.throw('Blockchain mismatch with "mock" network')
        expect(() => new Run({ blockchain: new WhatsOnChain(), api: 'run' })).to.throw('Blockchain mismatch with "run" api')
      })
    })

    // ------------------------------------------------------------------------
    // cache
    // ------------------------------------------------------------------------

    describe('cache', () => {
      if (BROWSER) {
        it('defaults to BrowserCache if browser', () => {
          expect(new Run().cache instanceof BrowserCache).to.equal(true)
          expect(new Run().cache.localCache instanceof LocalCache).to.equal(true)
        })
      } else {
        it('defaults to NodeCache if node', () => {
          expect(new Run().cache instanceof NodeCache).to.equal(true)
        })
      }

      // ----------------------------------------------------------------------

      it('local cache', () => {
        const cache = new LocalCache()
        expect(new Run({ cache }).cache).to.equal(cache)
      })

      // ----------------------------------------------------------------------

      it('map', () => {
        const cache = new Map()
        expect(new Run({ cache }).cache).to.equal(cache)
      })

      // ----------------------------------------------------------------------

      it('custom', () => {
        const cache = { get: () => { }, set: () => { } }
        expect(new Run({ cache }).cache).to.equal(cache)
      })

      // ----------------------------------------------------------------------

      it('defaults to default', () => {
        const defaultCache = Run.defaults.cache
        Run.defaults.cache = new LocalCache()
        expect(new Run().cache).to.equal(Run.defaults.cache)
        Run.defaults.cache = defaultCache
      })

      // ----------------------------------------------------------------------

      it('reuses cache if same network', () => {
        const run = new Run()
        const run2 = new Run()
        expect(run.cache).to.equal(run2.cache)
      })

      // ----------------------------------------------------------------------

      it('does not reuse cache if different networks', () => {
        const run = new Run({ network: 'main' })
        const run2 = new Run({ network: 'mock' })
        expect(run.cache).not.to.equal(run2.cache)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ cache: undefined })).to.throw('Invalid cache: undefined')
        expect(() => new Run({ cache: null })).to.throw('Invalid cache: null')
        expect(() => new Run({ cache: {} })).to.throw('Invalid cache: [object Object]')
        expect(() => new Run({ cache: new Set() })).to.throw('Invalid cache: [object Set]')
        expect(() => new Run({ cache: { get: () => { } } })).to.throw('Invalid cache: [object Object]')
        expect(() => new Run({ cache: { set: () => { } } })).to.throw('Invalid cache: [object Object]')
        expect(() => new Run({ cache: { get: () => { }, set: 1 } })).to.throw('Invalid cache: [object Object]')
        expect(() => new Run({ cache: { get: null, set: () => {} } })).to.throw('Invalid cache: [object Object]')
      })

      // ----------------------------------------------------------------------

      it('throws helpful error message if run-db', () => {
        const error = 'The RunDB plugin is now a state provider, not a cache'
        expect(() => new Run({ cache: new RunDB() })).to.throw(error)
      })
    })

    // ------------------------------------------------------------------------
    // client
    // ------------------------------------------------------------------------

    describe('client', () => {
      it('defaults to default', () => {
        expect(new Run().client).to.equal(Run.defaults.client)
      })

      // ----------------------------------------------------------------------

      it('boolean', () => {
        expect(new Run({ client: true }).client).to.equal(true)
        expect(new Run({ client: false }).client).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ client: undefined })).to.throw('Invalid client: undefined')
        expect(() => new Run({ client: null })).to.throw('Invalid client: null')
        expect(() => new Run({ client: -1 })).to.throw('Invalid client: -1')
        expect(() => new Run({ client: new Set() })).to.throw('Invalid client: [object Set]')
      })
    })

    // ------------------------------------------------------------------------
    // debug
    // ------------------------------------------------------------------------

    describe('debug', () => {
      it('defaults to default', () => {
        expect(new Run().debug).to.equal(Run.defaults.debug)
      })

      // ----------------------------------------------------------------------

      it('boolean', () => {
        expect(new Run({ debug: true }).debug).to.equal(true)
        expect(new Run({ debug: false }).debug).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ debug: undefined })).to.throw('Invalid debug: undefined')
        expect(() => new Run({ debug: null })).to.throw('Invalid debug: null')
        expect(() => new Run({ debug: 1 })).to.throw('Invalid debug: 1')
        expect(() => new Run({ debug: () => {} })).to.throw('Invalid debug: [anonymous function]')
      })
    })

    // ------------------------------------------------------------------------
    // inventory
    // ------------------------------------------------------------------------

    describe('inventory', () => {
      it('defaults to new inventory', () => {
        expect(new Run().inventory instanceof Inventory).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('may pass existing inventory', () => {
        const inventory = new Inventory()
        expect(new Run({ inventory }).inventory).to.equal(inventory)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ inventory: undefined })).to.throw('Invalid inventory: undefined')
        expect(() => new Run({ inventory: null })).to.throw('Invalid inventory: null')
        expect(() => new Run({ inventory: true })).to.throw('Invalid inventory: true')
        expect(() => new Run({ inventory: {} })).to.throw('Invalid inventory: [object Object]')
        expect(() => new Run({ inventory: 123 })).to.throw('Invalid inventory: 123')
      })

      // ----------------------------------------------------------------------

      it('does not reuse across run instances', () => {
        const run = new Run()
        const run2 = new Run()
        expect(run.inventory).not.to.equal(run2.inventory)
      })
    })

    // ------------------------------------------------------------------------
    // logger
    // ------------------------------------------------------------------------

    describe('logger', () => {
      it('defaults to default', () => {
        expect(new Run().logger).to.equal(Run.defaults.logger)
      })

      // ----------------------------------------------------------------------

      it('null', () => {
        expect(new Run({ logger: null }).logger).to.equal(null)
      })

      // ----------------------------------------------------------------------

      it('console', () => {
        expect(new Run({ logger: console }).logger).to.equal(console)
      })

      // ------------------------------------------------------------------------

      it('custom', () => {
        expect(() => new Run({ logger: {} })).not.to.throw()

        // Create a basic info logger as an object
        let loggedInfo = false
        const run = new Run({ logger: { info: () => { loggedInfo = true } } })
        run.logger.info('test')
        expect(loggedInfo).to.equal(true)

        // Create a basic error logger as a function object
        let loggedError = false
        const functionLogger = function () { }
        functionLogger.error = () => { loggedError = true }
        const run2 = new Run({ logger: functionLogger })
        run2.logger.error('test')
        expect(loggedError).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ logger: 1 })).to.throw('Invalid logger: 1')
        expect(() => new Run({ logger: false })).to.throw('Invalid logger: false')
        expect(() => new Run({ logger: 'none' })).to.throw('Invalid logger: "none"')
        expect(() => new Run({ logger: undefined })).to.throw('Invalid logger: undefined')
      })
    })

    // ------------------------------------------------------------------------
    // network
    // ------------------------------------------------------------------------

    describe('network', () => {
      it('RunConnect used for main network', () => {
        const run = new Run({ network: 'main' })
        expect(run.blockchain instanceof RunConnect).to.equal(true)
        expect(run.state instanceof StateServer).to.equal(true)
        expect(run.api).to.equal('run')
      })

      // ----------------------------------------------------------------------

      it('RunConnect used for test network', () => {
        const run = new Run({ network: 'test' })
        expect(run.blockchain instanceof RunConnect).to.equal(true)
        expect(run.state instanceof StateServer).to.equal(true)
        expect(run.api).to.equal('run')
      })

      // ----------------------------------------------------------------------

      it('WhatsOnChain used for stn network', () => {
        const run = new Run({ network: 'stn' })
        expect(run.blockchain instanceof WhatsOnChain).to.equal(true)
        expect(run.state instanceof LocalState).to.equal(true)
        expect(run.api).to.equal('whatsonchain')
      })

      // ----------------------------------------------------------------------

      it('Mockchain used for mock network', () => {
        const run = new Run({ network: 'mock' })
        expect(run.blockchain instanceof Mockchain).to.equal(true)
        expect(run.state instanceof LocalState).to.equal(true)
        expect(run.api).to.equal(undefined)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ network: '' })).to.throw('Invalid network: ""')
        expect(() => new Run({ network: 'mainnet' })).to.throw('Invalid network: "mainnet"')
        expect(() => new Run({ network: 'tester' })).to.throw('Invalid network: "tester"')
        expect(() => new Run({ network: 'mocknet' })).to.throw('Invalid network: "mocknet"')
        expect(() => new Run({ network: null })).to.throw('Invalid network: null')
        expect(() => new Run({ network: 123 })).to.throw('Invalid network: 123')
      })
    })

    // ------------------------------------------------------------------------
    // networkRetries
    // ------------------------------------------------------------------------

    describe('networkRetries', () => {
      it('defaults to default', () => {
        const previousDefault = Run.defaults.networkRetries
        Run.defaults.networkRetries = 10
        expect(new Run().networkRetries).to.equal(Run.defaults.networkRetries)
        expect(request.defaults.retries).to.equal(Run.defaults.networkRetries)
        Run.defaults.networkRetries = previousDefault
      })

      // ----------------------------------------------------------------------

      it('non-negative integer', () => {
        const test = (x) => {
          expect(new Run({ networkRetries: x }).networkRetries).to.equal(x)
          expect(request.defaults.retries).to.equal(x)
        }
        test(0)
        test(1)
        test(10)
        test(Number.MAX_SAFE_INTEGER)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const retriesBefore = request.defaults.retries
        expect(() => new Run({ networkRetries: undefined })).to.throw('Invalid network retries: undefined')
        expect(() => new Run({ networkRetries: null })).to.throw('Invalid network retries: null')
        expect(() => new Run({ networkRetries: {} })).to.throw('Invalid network retries: [object Object]')
        expect(() => new Run({ networkRetries: () => {} })).to.throw('Invalid network retries: [anonymous function]')
        expect(() => new Run({ networkRetries: -1 })).to.throw('Invalid network retries: -1')
        expect(() => new Run({ networkRetries: Number.MAX_VALUE })).to.throw(`Invalid network retries: ${Number.MAX_VALUE}`)
        expect(() => new Run({ networkRetries: NaN })).to.throw('Invalid network retries: NaN')
        expect(() => new Run({ networkRetries: Infinity })).to.throw('Invalid network retries: Infinity')
        expect(() => new Run({ networkRetries: 1.5 })).to.throw('Invalid network retries: 1.5')
        expect(() => new Run({ networkRetries: -1.5 })).to.throw('Invalid network retries: -1.5')
        expect(request.defaults.retries).to.equal(retriesBefore)
      })
    })

    // ------------------------------------------------------------------------
    // networkTimeout
    // ------------------------------------------------------------------------

    describe('networkTimeout', () => {
      it('defaults to default', () => {
        const previousDefault = Run.defaults.networkTimeout
        Run.defaults.networkTimeout = 18000
        expect(new Run().networkTimeout).to.equal(Run.defaults.networkTimeout)
        expect(request.defaults.timeout).to.equal(Run.defaults.networkTimeout)
        Run.defaults.networkTimeout = previousDefault
      })

      // ----------------------------------------------------------------------

      it('non-negative number', () => {
        const test = (x) => {
          expect(new Run({ networkTimeout: x }).networkTimeout).to.equal(x)
          expect(request.defaults.timeout).to.equal(x)
        }
        test(0)
        test(1)
        test(10)
        test(1000000.5)
        test(Number.MAX_SAFE_INTEGER)
        test(Number.MAX_VALUE)
        test(Infinity)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const timeoutBefore = request.defaults.timeout
        expect(() => new Run({ networkTimeout: undefined })).to.throw('Invalid network timeout: undefined')
        expect(() => new Run({ networkTimeout: null })).to.throw('Invalid network timeout: null')
        expect(() => new Run({ networkTimeout: {} })).to.throw('Invalid network timeout: [object Object]')
        expect(() => new Run({ networkTimeout: () => {} })).to.throw('Invalid network timeout: [anonymous function]')
        expect(() => new Run({ networkTimeout: -1 })).to.throw('Invalid network timeout: -1')
        expect(() => new Run({ networkTimeout: NaN })).to.throw('Invalid network timeout: NaN')
        expect(() => new Run({ networkTimeout: -1.5 })).to.throw('Invalid network timeout: -1.5')
        expect(request.defaults.timeout).to.equal(timeoutBefore)
      })
    })

    // ------------------------------------------------------------------------
    // owner
    // ------------------------------------------------------------------------

    describe('owner', () => {
      it('defaults to new random local owner', () => {
        const run = new Run()
        expect(run.owner instanceof LocalOwner).to.equal(true)
        const run2 = new Run()
        expect(run2.owner instanceof LocalOwner).to.equal(true)
        expect(run.owner.privkey).not.to.equal(run2.owner.privkey)
      })

      // ----------------------------------------------------------------------

      it('local owner', () => {
        const owner = new LocalOwner()
        const run = new Run({ owner })
        expect(run.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('private key string', () => {
        const owner = new bsv.PrivateKey().toString()
        const run = new Run({ owner })
        expect(run.owner instanceof LocalOwner).to.equal(true)
        expect(run.owner.privkey).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('public key string', () => {
        const owner = new bsv.PrivateKey().publicKey.toString()
        const run = new Run({ owner })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('private key bsv object', () => {
        const owner = new bsv.PrivateKey()
        const run = new Run({ owner })
        expect(run.owner instanceof LocalOwner).to.equal(true)
        expect(run.owner.privkey).to.equal(owner.toString())
      })

      // ----------------------------------------------------------------------

      it('public key bsv object', () => {
        const owner = new bsv.PrivateKey().publicKey
        const run = new Run({ owner })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner.toString())
      })

      // ----------------------------------------------------------------------

      it('address string mainnet', () => {
        const owner = new bsv.PrivateKey('mainnet').toAddress().toString()
        const run = new Run({ owner, network: 'main' })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('address string testnet', () => {
        const owner = new bsv.PrivateKey('testnet').toAddress().toString()
        const run = new Run({ owner, network: 'test' })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('address bsv object mainnet', () => {
        const owner = new bsv.PrivateKey('mainnet').toAddress()
        const run = new Run({ owner, network: 'main' })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner.toString())
      })

      // ----------------------------------------------------------------------

      it('address bsv object testnet', () => {
        const owner = new bsv.PrivateKey('testnet').toAddress()
        const run = new Run({ owner, network: 'test' })
        expect(run.owner instanceof Viewer).to.equal(true)
        expect(run.owner.owner).to.equal(owner.toString())
      })

      // ----------------------------------------------------------------------

      it('throws if mainnet address string on testnet', () => {
        const owner = new bsv.PrivateKey('mainnet').toAddress().toString()
        expect(() => new Run({ owner, network: 'test' })).to.throw('Invalid owner')
      })

      // ----------------------------------------------------------------------

      it('throws if testnet address bsv object on mainnet', () => {
        const owner = new bsv.PrivateKey('testnet').toAddress()
        expect(() => new Run({ owner, network: 'main' })).to.throw('Invalid owner')
      })

      // ----------------------------------------------------------------------

      it('custom owner', () => {
        const owner = { sign: () => { }, nextOwner: () => { } }
        const run = new Run({ owner })
        expect(run.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('viewer', () => {
        const owner = new Viewer(new bsv.PrivateKey().publicKey.toString())
        const run = new Run({ owner })
        expect(run.owner).to.equal(owner)
      })

      // ----------------------------------------------------------------------

      it('defaults to LocalOwner default', () => {
        const defaultOwner = Run.defaults.owner
        try {
          Run.defaults.owner = new LocalOwner()
          const run = new Run()
          expect(run.owner).to.equal(Run.defaults.owner)
        } finally {
          Run.defaults.owner = defaultOwner
        }
      })

      // ----------------------------------------------------------------------

      it('defaults to string default', () => {
        const defaultOwner = Run.defaults.owner
        try {
          const blockchain = new Mockchain()
          Run.defaults.owner = new bsv.PrivateKey().toString()
          const run = new Run({ blockchain })
          expect(run.owner instanceof LocalOwner).to.equal(true)
          expect(run.owner.privkey).to.equal(Run.defaults.owner)
        } finally {
          Run.defaults.owner = defaultOwner
        }
      })

      // ----------------------------------------------------------------------

      it('does not reuse', () => {
        const run = new Run({ network: 'main' })
        const run2 = new Run({ network: 'main' })
        expect(run.owner).not.to.equal(run2.owner)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ owner: undefined })).to.throw('Invalid owner: undefined')
        expect(() => new Run({ owner: null })).to.throw('Invalid owner: null')
        expect(() => new Run({ owner: {} })).to.throw('Invalid owner: [object Object]')
        expect(() => new Run({ owner: true })).to.throw('Invalid owner: true')
        expect(() => new Run({ owner: '' })).to.throw('Invalid owner: ""')
        expect(() => new Run({ owner: 'abc' })).to.throw('Invalid owner: "abc"')
        expect(() => new Run({ owner: 0 })).to.throw('Invalid owner: 0')
        expect(() => new Run({ owner: new LocalPurse({ blockchain: new Mockchain() }) })).to.throw('Invalid owner')
        expect(() => new Run({ owner: { sign: () => { } } })).to.throw('Invalid owner: [object Object]')
        expect(() => new Run({ owner: { nextOwner: () => { } } })).to.throw('Invalid owner: [object Object]')
        expect(() => new Run({ owner: { sign: () => { }, nextOwner: 1 } })).to.throw('Invalid owner: [object Object]')
        expect(() => new Run({ owner: { sign: null, nextOwner: () => {} } })).to.throw('Invalid owner: [object Object]')
      })
    })

    // ------------------------------------------------------------------------
    // preverify
    // ------------------------------------------------------------------------

    describe('preverify', () => {
      it('defaults to default', () => {
        expect(new Run().preverify).to.equal(Run.defaults.preverify)
      })

      // ----------------------------------------------------------------------

      it('true', async () => {
        const run = new Run({ preverify: true })
        expect(run.preverify).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('false', async () => {
        const run = new Run({ preverify: false })
        expect(run.preverify).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ preverify: undefined })).to.throw('Invalid preverify: undefined')
        expect(() => new Run({ preverify: null })).to.throw('Invalid preverify: null')
        expect(() => new Run({ preverify: -1 })).to.throw('Invalid preverify: -1')
        expect(() => new Run({ preverify: new Mockchain() })).to.throw('Invalid preverify')
      })
    })

    // ------------------------------------------------------------------------
    // purse
    // ------------------------------------------------------------------------

    describe('purse', () => {
      it('defaults to new random local purse', () => {
        const run = new Run()
        expect(run.purse instanceof LocalPurse).to.equal(true)
        const run2 = new Run()
        expect(run2.purse instanceof LocalPurse).to.equal(true)
        expect(run.purse.privkey).not.to.equal(run2.purse.privkey)
      })

      // ----------------------------------------------------------------------

      it('local purse', () => {
        const blockchain = new Mockchain()
        const purse = new LocalPurse({ blockchain })
        const run = new Run({ purse, blockchain })
        expect(run.purse).to.equal(purse)
      })

      // ----------------------------------------------------------------------

      it('private key string', () => {
        const blockchain = new Mockchain()
        const purse = new bsv.PrivateKey('testnet').toString()
        const run = new Run({ purse, blockchain })
        expect(run.purse instanceof LocalPurse).to.equal(true)
        expect(run.purse.privkey).to.equal(purse)
      })

      // ----------------------------------------------------------------------

      it('private key bsv object', () => {
        const blockchain = new RunConnect()
        const purse = new bsv.PrivateKey('mainnet')
        const run = new Run({ purse, blockchain })
        expect(run.purse instanceof LocalPurse).to.equal(true)
        expect(run.purse.privkey).to.equal(purse.toString())
      })

      // ----------------------------------------------------------------------

      it('custom purse', () => {
        const blockchain = new Mockchain()
        const purse = { pay: () => { } }
        const run = new Run({ purse, blockchain })
        expect(run.purse).to.equal(purse)
      })

      // ----------------------------------------------------------------------

      it('defaults to LocalPurse default', () => {
        const defaultPurse = Run.defaults.purse
        try {
          const blockchain = new Mockchain()
          Run.defaults.purse = new LocalPurse({ blockchain })
          const run = new Run({ blockchain })
          expect(run.purse).to.equal(Run.defaults.purse)
        } finally {
          Run.defaults.purse = defaultPurse
        }
      })

      // ----------------------------------------------------------------------

      it('defaults to string default', () => {
        const defaultPurse = Run.defaults.purse
        try {
          const blockchain = new Mockchain()
          Run.defaults.purse = new bsv.PrivateKey().toString()
          const run = new Run({ blockchain })
          expect(run.purse instanceof LocalPurse).to.equal(true)
          expect(run.purse.privkey).to.equal(Run.defaults.purse)
        } finally {
          Run.defaults.purse = defaultPurse
        }
      })

      // ----------------------------------------------------------------------

      it('sets blockchain if purse wrapper', () => {
        const purse = new LocalPurse({ blockchain: new Mockchain() })
        const run = new Run({ purse })
        expect(run.purse.blockchain).to.equal(run.blockchain)
      })

      // ----------------------------------------------------------------------

      it('does not reuse', () => {
        const run = new Run({ network: 'main' })
        const run2 = new Run({ network: 'main' })
        expect(run.purse).not.to.equal(run2.purse)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ purse: undefined })).to.throw('Invalid purse: undefined')
        expect(() => new Run({ purse: null })).to.throw('Invalid purse: null')
        expect(() => new Run({ purse: {} })).to.throw('Invalid purse: [object Object]')
        expect(() => new Run({ purse: { pay: false } })).to.throw('Invalid purse: [object Object]')
        expect(() => new Run({ purse: 123 })).to.throw('Invalid purse: 123')
        expect(() => new Run({ purse: 'xyz' })).to.throw('Invalid purse: "xyz"')
        expect(() => new Run({ purse: true })).to.throw('Invalid purse: true')
      })
    })

    // ------------------------------------------------------------------------
    // rollbacks
    // ------------------------------------------------------------------------

    describe('rollbacks', () => {
      it('defaults to default', () => {
        expect(new Run().rollbacks).to.equal(Run.defaults.rollbacks)
      })

      // ----------------------------------------------------------------------

      it('true', async () => {
        const run = new Run({ rollbacks: true })
        expect(run.rollbacks).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('false', async () => {
        const run = new Run({ rollbacks: false })
        expect(run.rollbacks).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ rollbacks: undefined })).to.throw('Invalid rollbacks: undefined')
        expect(() => new Run({ rollbacks: null })).to.throw('Invalid rollbacks: null')
        expect(() => new Run({ rollbacks: -1 })).to.throw('Invalid rollbacks: -1')
        expect(() => new Run({ rollbacks: new LocalOwner() })).to.throw('Invalid rollbacks')
      })
    })

    // ------------------------------------------------------------------------
    // state
    // ------------------------------------------------------------------------

    describe('state', () => {
      it('defaults to StateServer on mainnet', () => {
        const run = new Run({ network: 'main' })
        expect(run.state instanceof StateServer).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('defaults to StateServer on testnet', () => {
        const run = new Run({ network: 'test', api: 'whatsonchain' })
        expect(run.state instanceof StateServer).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('defaults to LocalState on mock network', () => {
        const run = new Run({ network: 'mock' })
        expect(run.state instanceof LocalState).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('defaults to default', () => {
        const stateBefore = Run.defaults.state
        Run.defaults.state = { pull: () => { } }
        const run = new Run({ network: 'main', api: 'whatsonchain' })
        expect(run.state).to.equal(Run.defaults.state)
        Run.defaults.state = stateBefore
      })

      // ----------------------------------------------------------------------

      it('custom state', () => {
        const state = { pull: () => { } }
        const run = new Run({ state })
        expect(run.state).to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('specify StateServer with other api', () => {
        const state = new StateServer()
        const run = new Run({ api: 'whatsonchain', network: 'main', state })
        expect(run.state).to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('sets cache if state wrapper', () => {
        const state = new LocalState()
        const run = new Run({ state })
        expect(run.state.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('reuses state if same network and api', () => {
        const state = { pull: () => { } }
        new Run({ state }) // eslint-disable-line
        const run2 = new Run()
        expect(run2.state).to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('does not reuse state if different network', () => {
        const state = { pull: () => { } }
        new Run({ state, network: 'main' }) // eslint-disable-line
        const run2 = new Run({ network: 'test' })
        expect(run2.state).not.to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('does not reuse state if different api', () => {
        const state = { pull: () => { } }
        new Run({ state, network: 'main' }) // eslint-disable-line
        const run2 = new Run({ api: 'whatsonchain', network: 'main' })
        expect(run2.state).not.to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ state: undefined })).to.throw('Invalid state: undefined')
        expect(() => new Run({ state: null })).to.throw('Invalid state: null')
        expect(() => new Run({ state: {} })).to.throw('Invalid state: [object Object]')
        expect(() => new Run({ state: new Set() })).to.throw('Invalid state: [object Set]')
        expect(() => new Run({ state: { get: () => { } } })).to.throw('Invalid state: [object Object]')
        expect(() => new Run({ state: { state: 1 } })).to.throw('Invalid state: [object Object]')
        expect(() => new Run({ state: { state: null } })).to.throw('Invalid state: [object Object]')
      })
    })

    // ------------------------------------------------------------------------
    // timeout
    // ------------------------------------------------------------------------

    describe('timeout', () => {
      it('defaults to default', () => {
        const previousDefault = Run.defaults.timeout
        Run.defaults.timeout = 18000
        expect(new Run().timeout).to.equal(Run.defaults.timeout)
        Run.defaults.timeout = previousDefault
      })

      // ----------------------------------------------------------------------

      it('non-negative number', () => {
        const test = (x) => expect(new Run({ timeout: x }).timeout).to.equal(x)
        test(0)
        test(1)
        test(10)
        test(1000000.5)
        test(Number.MAX_SAFE_INTEGER)
        test(Number.MAX_VALUE)
        test(Infinity)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ timeout: undefined })).to.throw('Invalid timeout: undefined')
        expect(() => new Run({ timeout: null })).to.throw('Invalid timeout: null')
        expect(() => new Run({ timeout: {} })).to.throw('Invalid timeout: [object Object]')
        expect(() => new Run({ timeout: () => {} })).to.throw('Invalid timeout: [anonymous function]')
        expect(() => new Run({ timeout: -1 })).to.throw('Invalid timeout: -1')
        expect(() => new Run({ timeout: NaN })).to.throw('Invalid timeout: NaN')
        expect(() => new Run({ timeout: -1.5 })).to.throw('Invalid timeout: -1.5')
      })
    })

    // ------------------------------------------------------------------------
    // trust
    // ------------------------------------------------------------------------

    describe('trust', () => {
      it('location', async () => {
        const defaultTrust = Run.defaults.trust
        Run.defaults.trust = []
        const run = new Run()
        class A {}
        run.deploy(A)
        await run.sync()
        const txid = A.location.slice(0, 64)
        run.deactivate()
        const run2 = new Run({ blockchain: run.blockchain, trust: txid })
        await run2.load(A.location)
        Run.defaults.trust = defaultTrust
      })

      // ----------------------------------------------------------------------

      it('wildcard', async () => {
        const defaultTrust = Run.defaults.trust
        Run.defaults.trust = []
        const run = new Run()
        class A {}
        run.deploy(A)
        await run.sync()
        run.deactivate()
        const run2 = new Run({ blockchain: run.blockchain, trust: '*' })
        await run2.load(A.location)
        Run.defaults.trust = defaultTrust
      })

      // ----------------------------------------------------------------------

      it('cache', async () => {
        const defaultTrust = Run.defaults.trust
        Run.defaults.trust = []
        const run = new Run()
        class A {}
        run.deploy(A)
        await run.sync()
        run.deactivate()
        const run2 = new Run({ blockchain: run.blockchain, cache: run.cache, trust: 'cache' })
        await run2.load(A.location)
        Run.defaults.trust = defaultTrust
      })

      // ----------------------------------------------------------------------

      it('state', async () => {
        const defaultTrust = Run.defaults.trust
        Run.defaults.trust = []
        const run = new Run()
        class A {}
        run.deploy(A)
        await run.sync()
        run.deactivate()
        const run2 = new Run({ blockchain: run.blockchain, cache: run.cache, trust: 'state' })
        await run2.load(A.location)
        Run.defaults.trust = defaultTrust
      })

      // ----------------------------------------------------------------------

      it('array', async () => {
        const defaultTrust = Run.defaults.trust
        Run.defaults.trust = []
        const run = new Run()
        class A {}
        run.deploy(A)
        await run.sync()
        const txid = A.location.slice(0, 64)
        run.deactivate()
        const run2 = new Run({ blockchain: run.blockchain, trust: [txid, 'state', '*'] })
        await run2.load(A.location)
        Run.defaults.trust = defaultTrust
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ trust: undefined })).to.throw('Not trustable: undefined')
        expect(() => new Run({ trust: null })).to.throw('Not trustable: null')
        expect(() => new Run({ trust: {} })).to.throw('Not trustable: [object Object]')
        expect(() => new Run({ trust: 'abc' })).to.throw('Not trustable: "abc"')
        expect(() => new Run({ trust: 0 })).to.throw('Not trustable: 0')
        expect(() => new Run({ trust: true })).to.throw('Not trustable: true')
        expect(() => new Run({ trust: () => {} })).to.throw('Not trustable: [anonymous function]')
        expect(() => new Run({ trust: [null] })).to.throw('Not trustable: null')
      })
    })

    // ------------------------------------------------------------------------
    // wallet
    // ------------------------------------------------------------------------

    describe('wallet', () => {
      it('undefined if different owner and purse', () => {
        const run = new Run()
        expect(run.owner).not.to.equal(run.purse)
        expect(run.wallet).to.equal(undefined)
      })

      // ----------------------------------------------------------------------

      it('sets to owner and purse', () => {
        const wallet = { nextOwner: () => { }, sign: () => { }, pay: () => { } }
        const run = new Run({ wallet })
        expect(run.owner).to.equal(wallet)
        expect(run.purse).to.equal(wallet)
        expect(run.wallet).to.equal(wallet)
      })

      // ----------------------------------------------------------------------

      it('throws if owner different from wallet', () => {
        const wallet = { nextOwner: () => { }, sign: () => { }, pay: () => { } }
        expect(() => new Run({ wallet, owner: new LocalOwner() })).to.throw('Cannot set different owner and wallet')
      })

      // ----------------------------------------------------------------------

      it('throws if purse different from wallet', () => {
        const wallet = { nextOwner: () => { }, sign: () => { }, pay: () => { } }
        expect(() => new Run({ wallet, purse: new bsv.PrivateKey() })).to.throw('Cannot set different purse and wallet')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        expect(() => new Run({ wallet: undefined })).to.throw('Invalid wallet: undefined')
        expect(() => new Run({ wallet: null })).to.throw('Invalid wallet: null')
        expect(() => new Run({ wallet: 1 })).to.throw('Invalid wallet: 1')
        expect(() => new Run({ wallet: false })).to.throw('Invalid wallet: false')
        expect(() => new Run({ wallet: { sign: () => { }, pay: () => { } } })).to.throw('wallet does not implement the Owner API')
        expect(() => new Run({ wallet: { nextOwner: () => { }, pay: () => { } } })).to.throw('wallet does not implement the Owner API')
        expect(() => new Run({ wallet: { nextOwner: () => { }, sign: () => { } } })).to.throw('wallet does not implement the Purse API')
      })
    })
  })

  // --------------------------------------------------------------------------
  // properties
  // --------------------------------------------------------------------------

  describe('properties', () => {
    // ------------------------------------------------------------------------
    // api
    // ------------------------------------------------------------------------

    describe('api', () => {
      it('run', () => {
        const run = new Run({ api: 'whatsonchain', network: 'main' })
        run.api = 'run'
        expect(run.api).to.equal('run')
        expect(run.blockchain instanceof RunConnect).to.equal(true)
        expect(run.state instanceof StateServer).to.equal(true)
        expect(run.cache instanceof StateServer).to.equal(false)
        expect(run.network).to.equal('main')
      })

      // ----------------------------------------------------------------------

      it('whatsonchain', () => {
        const run = new Run({ api: 'run', network: 'test' })
        run.api = 'whatsonchain'
        expect(run.api).to.equal('whatsonchain')
        expect(run.blockchain instanceof WhatsOnChain).to.equal(true)
        expect(run.state instanceof StateServer).to.equal(true)
        expect(run.network).to.equal('test')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ api: 'run', network: 'test' })
        expect(() => { run.api = 'mock' }).to.throw('Invalid api: "mock"')
        expect(() => { run.api = 'bad' }).to.throw('Invalid api: "bad"')
        expect(() => { run.api = null }).to.throw('Invalid api: null')
        expect(() => { run.api = 123 }).to.throw('Invalid api: 123')
        expect(run.api).to.equal('run')
        expect(run.blockchain instanceof RunConnect).to.equal(true)
        expect(run.network).to.equal('test')
      })

      // ----------------------------------------------------------------------

      it('change blockchain', () => {
        const run = new Run({ api: 'run', network: 'main' })
        run.blockchain = new Run.plugins.WhatsOnChain()
        expect(run.api).to.equal(undefined)
        run.blockchain = new Run.plugins.RunConnect()
        expect(run.api).to.equal(undefined)
        run.blockchain = new Run.plugins.Mockchain()
        expect(run.api).to.equal(undefined)
      })
    })

    // ------------------------------------------------------------------------
    // apiKey
    // ------------------------------------------------------------------------

    describe('apiKey', () => {
      it('change', () => {
        const run = new Run({ api: 'whatsonchain', network: 'main' })
        run.apiKey = '123'
        expect(run.apiKey).to.equal(run.blockchain.apiKey)
        expect(run.apiKey).to.equal('123')
        expect(run.api).to.equal('whatsonchain')
      })
    })

    // ------------------------------------------------------------------------
    // app
    // ------------------------------------------------------------------------

    describe('app', () => {
      it('change', () => {
        const run = new Run()
        run.app = 'abc'
        expect(run.app).to.equal('abc')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ app: 'abc' })
        expect(() => { run.app = undefined }).to.throw('Invalid app: undefined')
        expect(() => { run.app = null }).to.throw('Invalid app: null')
        expect(() => { run.app = false }).to.throw('Invalid app: false')
        expect(() => { run.app = {} }).to.throw('Invalid app: [object Object]')
        expect(run.app).to.equal('abc')
      })
    })

    // ------------------------------------------------------------------------
    // autofund
    // ------------------------------------------------------------------------

    describe('autofund', () => {
      it('enable', async () => {
        const run = new Run({ network: 'mock', autofund: false })
        run.autofund = true
        expect(run.autofund).to.equal(true)
        expect((await run.blockchain.utxos(run.purse.address)).length > 0).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('disable', async () => {
        const run = new Run({ network: 'mock', autofund: true })
        run.autofund = false
        expect(run.autofund).to.equal(false)
        expect((await run.blockchain.utxos(run.purse.address)).length > 0).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ autofund: true })
        expect(() => { run.autofund = undefined }).to.throw('Invalid autofund: undefined')
        expect(() => { run.autofund = null }).to.throw('Invalid autofund: null')
        expect(() => { run.autofund = 'abc' }).to.throw('Invalid autofund: "abc"')
        expect(() => { run.autofund = NaN }).to.throw('Invalid autofund: NaN')
        expect(run.autofund).to.equal(true)
      })
    })

    // ------------------------------------------------------------------------
    // blockchain
    // ------------------------------------------------------------------------

    describe('blockchain', () => {
      it('change', () => {
        const run = new Run({ api: 'whatsonchain', network: 'test', apiKey: 'abc' })
        run.blockchain = new Mockchain()
        expect(run.api).to.equal(undefined)
        expect(run.apiKey).to.equal(undefined)
        expect(run.network).to.equal('mock')
      })

      // ----------------------------------------------------------------------

      it('sets cache if blockchain wrapper', () => {
        const run = new Run()
        run.blockchain = new Mockchain()
        expect(run.blockchain.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('sets to purse wrapper', () => {
        const purse = new LocalPurse({ blockchain: new Mockchain() })
        expect(purse instanceof PurseWrapper).to.equal(true)
        const run = new Run({ purse })
        run.blockchain = new Mockchain()
        expect(run.purse.blockchain).to.equal(run.blockchain)
      })

      // ----------------------------------------------------------------------

      it('does not change custom purse', () => {
        const purse = { pay: () => { } }
        const run = new Run({ purse })
        run.blockchain = new Mockchain()
        expect(run.purse.blockchain).not.to.equal(run.blockchain)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const blockchain = run.blockchain
        expect(() => { run.blockchain = undefined }).to.throw('Invalid blockchain: undefined')
        expect(() => { run.blockchain = null }).to.throw('Invalid blockchain: null')
        expect(() => { run.blockchain = {} }).to.throw('Invalid blockchain: [object Object]')
        expect(() => { run.blockchain = true }).to.throw('Invalid blockchain: true')
        expect(run.blockchain).to.equal(blockchain)
      })
    })

    // ------------------------------------------------------------------------
    // cache
    // ------------------------------------------------------------------------

    describe('cache', () => {
      it('change', () => {
        const run = new Run()
        const cache = new Map()
        run.cache = cache
        expect(run.cache === cache).to.equal(true)
        expect(cache.size).to.equal(0)
      })

      // ----------------------------------------------------------------------

      it('sets to blockchain wrapper', () => {
        const blockchain = new Mockchain()
        expect(blockchain instanceof BlockchainWrapper).to.equal(true)
        const run = new Run({ blockchain })
        run.cache = new LocalCache()
        expect(run.blockchain.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('sets to state wrapper', () => {
        const state = new LocalState()
        expect(state instanceof StateWrapper).to.equal(true)
        const run = new Run({ state })
        run.cache = new LocalCache()
        expect(run.state.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('does not change custom blockchain', () => {
        const blockchain = { broadcast: () => {}, fetch: () => {}, utxos: () => {}, spends: () => {}, time: () => {}, network: 'test' }
        const run = new Run({ blockchain })
        run.cache = new LocalCache()
        expect(run.blockchain.cache).not.to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('does not change custom state', () => {
        const state = { pull: () => { } }
        const run = new Run({ state })
        run.cache = new LocalCache()
        expect(run.state.cache).not.to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const cache = run.cache
        expect(() => { run.cache = undefined }).to.throw('Invalid cache: undefined')
        expect(() => { run.cache = null }).to.throw('Invalid cache: null')
        expect(() => { run.cache = { get: () => { } } }).to.throw('Invalid cache: [object Object]')
        expect(() => { run.cache = false }).to.throw('Invalid cache: false')
        expect(run.cache).to.equal(cache)
      })
    })

    // ------------------------------------------------------------------------
    // client
    // ------------------------------------------------------------------------

    describe('client', () => {
      it('change', () => {
        const run = new Run()
        const client = run.client
        run.client = !client
        expect(run.client).to.equal(!client)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ client: true })
        expect(() => { run.client = undefined }).to.throw('Invalid client: undefined')
        expect(() => { run.client = null }).to.throw('Invalid client: null')
        expect(() => { run.client = 'abc' }).to.throw('Invalid client: "abc"')
        expect(() => { run.client = {} }).to.throw('Invalid client: [object Object]')
        expect(run.client).to.equal(true)
      })
    })

    // ------------------------------------------------------------------------
    // debug
    // ------------------------------------------------------------------------

    describe('debug', () => {
      it('enable', async () => {
        const logger = stub({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} })
        const run = new Run({ logger })
        run.debug = false
        class A extends Jig { }
        const a = new A()
        await a.sync()
        expect(logger.debug.called).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('disable', async () => {
        const logger = stub({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} })
      new Run({ debug: true, logger }) // eslint-disable-line
        class A extends Jig { }
        const a = new A()
        await a.sync()
        expect(logger.debug.called).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('change', () => {
        const run = new Run()
        const debug = run.debug
        run.debug = !debug
        expect(run.debug).to.equal(!debug)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ debug: true })
        expect(() => { run.debug = undefined }).to.throw('Invalid debug: undefined')
        expect(() => { run.debug = null }).to.throw('Invalid debug: null')
        expect(() => { run.debug = 'abc' }).to.throw('Invalid debug: "abc"')
        expect(() => { run.debug = {} }).to.throw('Invalid debug: [object Object]')
        expect(run.debug).to.equal(true)
      })
    })

    // ----------------------------------------------------------------------
    // inventory
    // ----------------------------------------------------------------------

    describe('inventory', () => {
      it('set inventory', () => {
        const inventory = new Inventory()
        const run = new Run()
        run.inventory = inventory
        expect(run.inventory).to.equal(inventory)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const inventory = run.inventory
        expect(() => { run.inventory = undefined }).to.throw('Invalid inventory: undefined')
        expect(() => { run.inventory = null }).to.throw('Invalid inventory: null')
        expect(() => { run.inventory = true }).to.throw('Invalid inventory: true')
        expect(() => { run.inventory = [] }).to.throw('Invalid inventory: [object Array]')
        expect(() => { run.inventory = 'abc' }).to.throw('Invalid inventory: "abc"')
        expect(run.inventory).to.equal(inventory)
      })

      // ----------------------------------------------------------------------

      it('changes when change owner', () => {
        const run = new Run()
        const inventory = run.inventory
        run.owner = new bsv.PrivateKey().toString()
        expect(run.inventory).not.to.equal(inventory)
      })
    })

    // ------------------------------------------------------------------------
    // logger
    // ------------------------------------------------------------------------

    describe('logger', () => {
      it('custom', () => {
        const run = new Run()
        const originalLogger = run.logger
        const logger = {}
        run.logger = logger
        expect(run.logger).to.equal(logger)
        expect(run.logger).not.to.equal(originalLogger)
      })

      // ----------------------------------------------------------------------

      it('null', () => {
        const run = new Run()
        run.logger = null
        expect(run.logger).to.equal(null)
      })

      // ----------------------------------------------------------------------

      it('console', () => {
        const run = new Run()
        run.logger = console
        expect(run.logger).to.equal(console)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ logger: console })
        expect(() => { run.logger = 0 }).to.throw('Invalid logger: 0')
        expect(() => { run.logger = true }).to.throw('Invalid logger: true')
        expect(() => { run.logger = [] }).to.throw('Invalid logger: [object Array]')
        expect(() => { run.logger = undefined }).to.throw('Invalid logger: undefined')
        expect(run.logger).to.equal(console)
      })
    })

    // ------------------------------------------------------------------------
    // network
    // ------------------------------------------------------------------------

    describe('network', () => {
      it('change', () => {
        const run = new Run()
        run.network = 'main'
        expect(run.network).to.equal(run.blockchain.network)
        expect(run.network).to.equal('main')
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        expect(() => { run.network = undefined }).to.throw('Invalid network: undefined')
        expect(() => { run.network = null }).to.throw('Invalid network: null')
        expect(() => { run.network = ['main'] }).to.throw('Invalid network: [object Array]')
        expect(() => { run.network = -1 }).to.throw('Invalid network: -1')
        expect(() => { run.network = true }).to.throw('Invalid network: true')
        expect(() => { run.network = '' }).to.throw('Invalid network: ""')
        expect(run.network).to.equal(Run.defaults.network)
      })
    })

    // ------------------------------------------------------------------------
    // networkRetries
    // ------------------------------------------------------------------------

    describe('networkRetries', () => {
      it('change', () => {
        const run = new Run()
        run.networkRetries = 10
        expect(run.networkRetries).to.equal(10)
        expect(request.defaults.retries).to.equal(10)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        expect(() => { run.networkRetries = undefined }).to.throw('Invalid network retries: undefined')
        expect(() => { run.networkRetries = null }).to.throw('Invalid network retries: null')
        expect(() => { run.networkRetries = 100.1 }).to.throw('Invalid network retries: 100.1')
        expect(() => { run.networkRetries = -1 }).to.throw('Invalid network retries: -1')
        expect(() => { run.networkRetries = true }).to.throw('Invalid network retries: true')
        expect(() => { run.networkRetries = 'abc' }).to.throw('Invalid network retries: "abc"')
        expect(run.networkRetries).to.equal(Run.defaults.networkRetries)
        expect(request.defaults.retries).to.equal(Run.defaults.networkRetries)
      })
    })

    // ------------------------------------------------------------------------
    // networkTimeout
    // ------------------------------------------------------------------------

    describe('networkTimeout', () => {
      it('change', () => {
        const run = new Run()
        run.networkTimeout = 12345
        expect(run.networkTimeout).to.equal(12345)
        expect(request.defaults.timeout).to.equal(12345)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        expect(() => { run.networkTimeout = undefined }).to.throw('Invalid network timeout: undefined')
        expect(() => { run.networkTimeout = null }).to.throw('Invalid network timeout: null')
        expect(() => { run.networkTimeout = -1 }).to.throw('Invalid network timeout: -1')
        expect(() => { run.networkTimeout = true }).to.throw('Invalid network timeout: true')
        expect(() => { run.networkTimeout = 'abc' }).to.throw('Invalid network timeout: "abc"')
        expect(run.networkTimeout).to.equal(Run.defaults.networkTimeout)
        expect(request.defaults.timeout).to.equal(Run.defaults.networkTimeout)
      })
    })

    // ------------------------------------------------------------------------
    // owner
    // ------------------------------------------------------------------------

    describe('owner', () => {
      it('change', () => {
        const run = new Run()
        const privkey = new bsv.PrivateKey().toString()
        run.owner = privkey
        expect(run.owner instanceof LocalOwner).to.equal(true)
        expect(run.owner.privkey).to.equal(privkey)
      })

      // ----------------------------------------------------------------------

      it('reuses inventory if same owner', () => {
        const owner = new LocalOwner()
        const run = new Run({ owner })
        const previousInventory = run.inventory
        run.owner = owner
        expect(run.inventory).to.equal(previousInventory)
      })

      // ----------------------------------------------------------------------

      it('creates new inventory if different owner', () => {
        const run = new Run()
        const previousInventory = run.inventory
        const privkey = new bsv.PrivateKey().toString()
        run.owner = privkey
        expect(run.inventory instanceof Inventory).to.equal(true)
        expect(run.inventory).not.to.equal(previousInventory)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const owner = run.owner
        expect(() => { run.owner = undefined }).to.throw('Invalid owner: undefined')
        expect(() => { run.owner = null }).to.throw('Invalid owner: null')
        expect(() => { run.owner = { sign: () => { } } }).to.throw('Invalid owner: [object Object]')
        expect(() => { run.owner = { nextOwner: () => { } } }).to.throw('Invalid owner: [object Object]')
        expect(() => { run.owner = { sign: 'abc', nextOwner: () => { } } }).to.throw('Invalid owner: [object Object]')
        expect(() => { run.owner = false }).to.throw('Invalid owner: false')
        expect(() => { run.owner = 'abc' }).to.throw('Invalid owner: "abc"')
        expect(run.owner).to.equal(owner)
      })
    })

    // ------------------------------------------------------------------------
    // preverify
    // ------------------------------------------------------------------------

    describe('preverify', () => {
      it('enable', async () => {
        const run = new Run({ preverify: false })
        run.preverify = true
        expect(run.preverify).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('disable', async () => {
        const run = new Run({ preverify: true })
        run.preverify = false
        expect(run.preverify).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ preverify: true })
        expect(() => { run.preverify = undefined }).to.throw('Invalid preverify: undefined')
        expect(() => { run.preverify = null }).to.throw('Invalid preverify: null')
        expect(() => { run.preverify = 'abc' }).to.throw('Invalid preverify: "abc"')
        expect(() => { run.preverify = NaN }).to.throw('Invalid preverify: NaN')
        expect(run.preverify).to.equal(true)
      })
    })

    // ------------------------------------------------------------------------
    // purse
    // ------------------------------------------------------------------------

    describe('purse', () => {
      it('change', () => {
        const run = new Run()
        const privkey = new bsv.PrivateKey().toString()
        run.purse = privkey
        expect(run.purse instanceof LocalPurse).to.equal(true)
        expect(run.purse.privkey).to.equal(privkey)
      })

      // ----------------------------------------------------------------------

      it('sets blockchain if purse wrapper', () => {
        const run = new Run()
        run.purse = new LocalPurse({ blockchain: new Mockchain() })
        expect(run.purse.blockchain).to.equal(run.blockchain)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const purse = run.purse
        expect(() => { run.purse = undefined }).to.throw('Invalid purse: undefined')
        expect(() => { run.purse = null }).to.throw('Invalid purse: null')
        expect(() => { run.purse = { sign: () => { } } }).to.throw('Invalid purse: [object Object]')
        expect(() => { run.purse = { nextOwner: () => { } } }).to.throw('Invalid purse: [object Object]')
        expect(() => { run.purse = { sign: 'abc', nextOwner: () => { } } }).to.throw('Invalid purse: [object Object]')
        expect(() => { run.purse = false }).to.throw('Invalid purse: false')
        expect(() => { run.purse = 'abc' }).to.throw('Invalid purse: "abc"')
        expect(run.purse).to.equal(purse)
      })
    })

    // ------------------------------------------------------------------------
    // rollbacks
    // ------------------------------------------------------------------------

    describe('rollbacks', () => {
      it('enable', async () => {
        const run = new Run({ rollbacks: false })
        run.rollbacks = true
        expect(run.rollbacks).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('disable', async () => {
        const run = new Run({ rollbacks: true })
        run.rollbacks = false
        expect(run.rollbacks).to.equal(false)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run({ rollbacks: true })
        expect(() => { run.rollbacks = undefined }).to.throw('Invalid rollbacks: undefined')
        expect(() => { run.rollbacks = null }).to.throw('Invalid rollbacks: null')
        expect(() => { run.rollbacks = 'abc' }).to.throw('Invalid rollbacks: "abc"')
        expect(() => { run.rollbacks = NaN }).to.throw('Invalid rollbacks: NaN')
        expect(run.rollbacks).to.equal(true)
      })
    })

    // ------------------------------------------------------------------------
    // state
    // ------------------------------------------------------------------------

    describe('state', () => {
      it('change', () => {
        const run = new Run()
        const state = { pull: () => { } }
        run.state = state
        expect(run.state).to.equal(state)
      })

      // ----------------------------------------------------------------------

      it('sets cache if state wrapper', () => {
        const run = new Run()
        run.state = new LocalState()
        expect(run.state.cache).to.equal(run.cache)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        const state = run.state
        expect(() => { run.state = undefined }).to.throw('Invalid state: undefined')
        expect(() => { run.state = null }).to.throw('Invalid state: null')
        expect(() => { run.state = { state: new Map() } }).to.throw('Invalid state: [object Object]')
        expect(() => { run.state = false }).to.throw('Invalid state: false')
        expect(run.state).to.equal(state)
      })
    })

    // ------------------------------------------------------------------------
    // timeout
    // ------------------------------------------------------------------------

    describe('timeout', () => {
      it('change', () => {
        const run = new Run()
        run.timeout = 12345
        expect(run.timeout).to.equal(12345)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        expect(() => { run.timeout = undefined }).to.throw('Invalid timeout: undefined')
        expect(() => { run.timeout = null }).to.throw('Invalid timeout: null')
        expect(() => { run.timeout = -1 }).to.throw('Invalid timeout: -1')
        expect(() => { run.timeout = true }).to.throw('Invalid timeout: true')
        expect(() => { run.timeout = 'abc' }).to.throw('Invalid timeout: "abc"')
        expect(run.timeout).to.equal(Run.defaults.timeout)
      })
    })

    // ------------------------------------------------------------------------
    // wallet
    // ------------------------------------------------------------------------

    describe('wallet', () => {
      it('change', () => {
        const run = new Run()
        const wallet = { nextOwner: () => { }, sign: () => { }, pay: () => { } }
        run.wallet = wallet
        expect(run.owner).to.equal(wallet)
        expect(run.purse).to.equal(wallet)
        expect(run.wallet).to.equal(wallet)
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const run = new Run()
        expect(() => { run.wallet = undefined }).to.throw('Invalid wallet: undefined')
        expect(() => { run.wallet = null }).to.throw('Invalid wallet: null')
        expect(() => { run.wallet = 123 }).to.throw('Invalid wallet: 123')
        expect(() => { run.wallet = { sign: () => { }, pay: () => { } } }).to.throw('wallet does not implement the Owner API')
        expect(run.wallet).to.equal(undefined)
      })
    })
  })

  // --------------------------------------------------------------------------
  // methods
  // --------------------------------------------------------------------------

  describe('methods', () => {
    // ------------------------------------------------------------------------
    // activate
    // ------------------------------------------------------------------------

    describe('activate', () => {
      it('assigns instance', () => {
        const run = new Run({ debug: false })
        new Run({ debug: true }) // eslint-disable-line
        run.activate()
        expect(Run.instance).to.equal(run)
      })

      // ----------------------------------------------------------------------

      it('assigns logger with debug to log', () => {
        const logger = stub({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} })
        const run = new Run({ logger, debug: true })
        new Run({ debug: false }) // eslint-disable-line
        run.activate()
        expect(Log._infoOn).to.equal(true)
        expect(Log._warnOn).to.equal(true)
        expect(Log._errorOn).to.equal(true)
        expect(Log._debugOn).to.equal(true)
        Log._info('tag', 'a')
        Log._warn('tag', 'b')
        Log._error('tag', 'c')
        Log._debug('tag', 'd')
        expect(logger.info.lastCall.lastArg).to.equal('a')
        expect(logger.warn.lastCall.lastArg).to.equal('b')
        expect(logger.error.lastCall.lastArg).to.equal('c')
        expect(logger.debug.lastCall.lastArg).to.equal('d')
      })

      // ----------------------------------------------------------------------

      it('assigns logger without debug to log', () => {
        const logger = stub({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} })
        const run = new Run({ logger, debug: false })
        new Run({ debug: true }) // eslint-disable-line
        run.activate()
        expect(Log._infoOn).to.equal(true)
        expect(Log._warnOn).to.equal(true)
        expect(Log._errorOn).to.equal(true)
        expect(Log._debugOn).to.equal(false)
        Log._info('tag', 'a')
        Log._warn('tag', 'b')
        Log._error('tag', 'c')
        Log._debug('tag', 'd')
        expect(logger.info.lastCall.lastArg).to.equal('a')
        expect(logger.warn.lastCall.lastArg).to.equal('b')
        expect(logger.error.lastCall.lastArg).to.equal('c')
        expect(logger.debug.getCalls().length).to.equal(0)
      })

      // ----------------------------------------------------------------------

      it('assigns network retries to request', () => {
        const run = new Run({ networkRetries: 10 })
        new Run({ networkRetries: 11 }) // eslint-disable-line
        run.activate()
        expect(request.defaults.retries).to.equal(10)
      })

      // ----------------------------------------------------------------------

      it('assigns network timeout to request', () => {
        const run = new Run({ networkTimeout: 1200 })
        new Run({ networkTimeout: 1100 }) // eslint-disable-line
        run.activate()
        expect(request.defaults.timeout).to.equal(1200)
      })
    })

    // ------------------------------------------------------------------------
    // deactivate
    // ------------------------------------------------------------------------

    describe('deactivate', () => {
      it('clears instance', () => {
        const run = new Run()
        run.deactivate()
        expect(Run.instance).to.equal(null)
      })
    })

    // ------------------------------------------------------------------------
    // deploy
    // ------------------------------------------------------------------------

    describe('deploy', () => {
      it('deploy', async () => {
        const run = new Run()
        class A { }
        const CA = run.deploy(A)
        expect(CA.toString()).to.equal(A.toString())
        expect(CA instanceof Run.Code).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('throws if not active', async () => {
        const run = new Run()
        class A { }
        run.deactivate()
        expect(() => run.deploy(A)).to.throw('This Run instance is not active')
      })
    })

    // ------------------------------------------------------------------------
    // import
    // ------------------------------------------------------------------------

    describe('import', () => {
      it('publish', async () => {
        const run = new Run()
        class A { }
        const tx = new Run.Transaction()
        tx.update(() => run.deploy(A))
        const rawtx = await tx.export()
        const tx2 = await run.import(rawtx)
        await tx2.publish()
      })
    })

    // ------------------------------------------------------------------------
    // load
    // ------------------------------------------------------------------------

    describe('load', () => {
      it('loads', async () => {
        const run = new Run()
        class A { }
        run.deploy(A)
        await run.sync()
        const CA = await run.load(A.location)
        expect(CA.location).to.equal(A.location)
      })

      // ----------------------------------------------------------------------

      it('throws if not active', async () => {
        const run = new Run()
        class A { }
        run.deploy(A)
        await run.sync()
        run.deactivate()
        expect(() => run.load(A.location)).to.throw('This Run instance is not active')
      })
    })

    // ------------------------------------------------------------------------
    // sync
    // ------------------------------------------------------------------------

    describe('sync', () => {
      it('sync', async () => {
        const run = new Run()
        class A { }
        const CA = run.deploy(A)
        await run.sync()
        expect(CA.location).to.equal(A.location)
      })
    })

    // ------------------------------------------------------------------------
    // transaction
    // ------------------------------------------------------------------------

    describe('transaction', () => {
      it('deploys multiple', async () => {
        const run = new Run()
        class A { }
        const CA = run.transaction(() => run.deploy(A))
        await run.sync()
        expect(CA.location).to.equal(A.location)
      })

      // ----------------------------------------------------------------------

      it('throws if not active', async () => {
        const run = new Run()
        run.deactivate()
        expect(() => run.transaction(() => {})).to.throw('This Run instance is not active')
      })
    })

    // ------------------------------------------------------------------------
    // trust
    // ------------------------------------------------------------------------

    describe('trust', () => {
      it('trust valid values', () => {
        const run = new Run()
        run.trust('*')
        run.trust('cache')
        run.trust('61e1265acb3d93f1bf24a593d70b2a6b1c650ec1df90ddece8d6954ae3cdd915')
        run.trust('1111111111111111111111111111111111111111111111111111111111111111')
      })

      // ----------------------------------------------------------------------

      it('trust array of valid values', () => {
        const run = new Run()
        run.trust([
          '*',
          'state',
          '61e1265acb3d93f1bf24a593d70b2a6b1c650ec1df90ddece8d6954ae3cdd915',
          '1111111111111111111111111111111111111111111111111111111111111111'
        ])
      })

      // ----------------------------------------------------------------------

      it('throws if invalid values', () => {
        const run = new Run()
        expect(() => run.trust('61e1265acb3d93f1bf24a593d70b2a6b1c650ec1df90ddece8d6954ae3cdd915_o1')).to.throw('Not trustable')
        expect(() => run.trust('')).to.throw('Not trustable')
        expect(() => run.trust(null)).to.throw('Not trustable')
        expect(() => run.trust(1)).to.throw('Not trustable')
        expect(() => run.trust('cache2')).to.throw('Not trustable')
        expect(() => run.trust('-')).to.throw('Not trustable')
        expect(() => run.trust('all')).to.throw('Not trustable')
        expect(() => run.trust([''])).to.throw('Not trustable')
        expect(() => run.trust(['*', ''])).to.throw('Not trustable')
      })
    })
  })

  // --------------------------------------------------------------------------
  // util
  // --------------------------------------------------------------------------

  describe('util', () => {
    // ------------------------------------------------------------------------
    // install
    // ------------------------------------------------------------------------

    describe('install', () => {
      it('creates code', () => {
        class A { }
        const CA = Run.util.install(A)
        expect(CA instanceof Run.Code).to.equal(true)
      })

      // ----------------------------------------------------------------------

      it('returns same code twice', () => {
        function f () { }
        const cf = Run.util.install(f)
        const cf2 = Run.util.install(f)
        expect(cf).to.equal(cf2)
      })
    })

    // ------------------------------------------------------------------------
    // sha256
    // ------------------------------------------------------------------------

    describe('sha256', () => {
      it('custom', async () => {
        const sha256 = Run.util.sha256
        Run.util.sha256 = x => sha256(x)
        const run = new Run()
        class A { }
        run.deploy(A)
        await run.sync()
        Run.util.sha256 = sha256
      })

      // ----------------------------------------------------------------------

      it('throws if invalid', () => {
        const sha256 = Run.util.sha256
        expect(() => { Run.util.sha256 = undefined }).to.throw('Invalid sha256: undefined')
        expect(() => { Run.util.sha256 = null }).to.throw('Invalid sha256: null')
        expect(() => { Run.util.sha256 = 1 }).to.throw('Invalid sha256: 1')
        expect(() => { Run.util.sha256 = false }).to.throw('Invalid sha256: false')
        expect(() => { Run.util.sha256 = {} }).to.throw('Invalid sha256: [object Object]')
        expect(Run.util.sha256).to.equal(sha256)
      })
    })

    // ------------------------------------------------------------------------
    // unify
    // ------------------------------------------------------------------------

    describe('unify', () => {
      it('unifies', async () => {
        const run = new Run()
        const A2 = run.deploy(class A extends Jig { f () { this.n = 1 } })
        A2.auth()
        await A2.sync()
        const A1 = await run.load(A2.origin)
        const a1 = new A1()
        const a2 = new A2()
        expect(a1.constructor.location).not.to.equal(a2.constructor.location)
        Run.util.unify(a1, a2)
        expect(a1.constructor.location).to.equal(a2.constructor.location)
      })
    })

    // ------------------------------------------------------------------------
    // uninstall
    // ------------------------------------------------------------------------

    describe('uninstall', () => {
      it('returns different code when installed', () => {
        function f () { }
        const cf = Run.util.install(f)
        Run.util.uninstall(f)
        const cf2 = Run.util.install(f)
        expect(cf).not.to.equal(cf2)
      })
    })
  })

  // --------------------------------------------------------------------------
  // configure
  // --------------------------------------------------------------------------

  describe('configure', () => {
    it('api', () => {
      const defaults = Run.defaults
      Run.configure({ API: 'whatsonchain' })
      expect(Run.defaults.api).to.equal('whatsonchain')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('apiKey', () => {
      const defaults = Run.defaults
      Run.configure({ APIKEY: 'abc' })
      expect(Run.defaults.apiKey).to.equal('abc')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('apiKey for api', () => {
      const defaults = Run.defaults
      Run.configure({ APIKEY_WHATSONCHAIN: 'abc', API: 'whatsonchain' })
      expect(Run.defaults.apiKey).to.equal('abc')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('app', () => {
      const defaults = Run.defaults
      Run.configure({ APP: 'abc' })
      expect(Run.defaults.app).to.equal('abc')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('logger debug', () => {
      const defaults = Run.defaults
      Run.configure({ LOGGER: 'debug' })
      expect(Run.defaults.logger).to.equal(console)
      expect(Run.defaults.debug).to.equal(true)
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('logger on', () => {
      const defaults = Run.defaults
      Run.configure({ LOGGER: '1' })
      expect(Run.defaults.logger).to.equal(console)
      expect(Run.defaults.debug).to.equal(false)
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('logger off', () => {
      const defaults = Run.defaults
      Run.configure({ LOGGER: 'false' })
      expect(typeof Run.defaults.logger.info).to.equal('undefined')
      expect(typeof Run.defaults.logger.warn).to.equal('undefined')
      expect(typeof Run.defaults.logger.error).to.equal('undefined')
      expect(typeof Run.defaults.logger.debug).to.equal('undefined')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('network', () => {
      const defaults = Run.defaults
      Run.configure({ NETWORK: 'stn' })
      expect(Run.defaults.network).to.equal('stn')
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('purse', () => {
      const defaults = Run.defaults
      const purse = new bsv.PrivateKey().toString()
      Run.configure({ PURSE: purse })
      expect(Run.defaults.purse).to.equal(purse)
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('purse mainnet', () => {
      const defaults = Run.defaults
      const purse = new bsv.PrivateKey().toString()
      Run.configure({ PURSE_MAIN: purse, NETWORK: 'main' })
      expect(Run.defaults.purse).to.equal(purse)
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('owner', () => {
      const defaults = Run.defaults
      const owner = new bsv.PrivateKey().publicKey.toString()
      Run.configure({ OWNER: owner })
      expect(Run.defaults.owner).to.equal(owner)
      Run.defaults = defaults
    })

    // ------------------------------------------------------------------------

    it('owner testnet', () => {
      const defaults = Run.defaults
      const owner = new bsv.PrivateKey().publicKey.toString()
      Run.configure({ OWNER_TEST: owner }, 'test')
      expect(Run.defaults.owner).to.equal(owner)
      Run.defaults = defaults
    })
  })

  // --------------------------------------------------------------------------
  // misc
  // --------------------------------------------------------------------------

  describe('misc', () => {
    it('has bsv property', () => {
      expect(Run.bsv).to.equal(bsv)
    })
  })
})

// ------------------------------------------------------------------------------------------------
