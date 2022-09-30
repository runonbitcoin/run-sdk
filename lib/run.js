/**
 * index.js
 *
 * Primary library export and Run class
 */

// Bsv
const bsv = require('bsv')
const { PrivateKey, PublicKey, Address } = bsv

// Kernel
const Kernel = require('./kernel/kernel')
const { Blockchain, Cache, Lock, Logger, Owner, Purse, State } = require('./kernel/api')
const Jig = require('./kernel/jig')
const Berry = require('./kernel/berry')
const Code = require('./kernel/code')
const Editor = require('./kernel/editor')
const Commit = require('./kernel/commit')
const _load = require('./kernel/load')
const Creation = require('./kernel/creation')
const CommonLock = require('./kernel/common-lock')
const Transaction = require('./kernel/transaction')
const { _unifyForMethod } = require('./kernel/unify')
const Sandbox = require('./kernel/sandbox')
const Log = require('./kernel/log')
const { _text, _limit } = require('./kernel/misc')
const { _browser, _nodejs } = require('./kernel/environment')
const request = require('./plugins/request')
const { ArgumentError } = require('./kernel/error')
const { _extractMetadata, _extractTxDeps } = require('./kernel/metadata')

// Plugins
const BrowserCache = require('./plugins/browser-cache')
const DiskCache = require('./plugins/disk-cache')
const IndexedDbCache = require('./plugins/indexeddb-cache')
const Inventory = require('./plugins/inventory')
const LocalCache = require('./plugins/local-cache')
const LocalOwner = require('./plugins/local-owner')
const LocalPurse = require('./plugins/local-purse')
const LocalState = require('./plugins/local-state')
const Mockchain = require('./plugins/mockchain')
const NodeCache = require('./plugins/node-cache')
const PayServer = require('./plugins/pay-server')
const RunConnect = require('./plugins/run-connect')
const RunDB = require('./plugins/run-db')
const StateServer = require('./plugins/state-server')
const Viewer = require('./plugins/viewer')
const WhatsOnChain = require('./plugins/whatsonchain')

// Wrappers
const BlockchainWrapper = require('./plugins/blockchain-wrapper')
const CacheWrapper = require('./plugins/cache-wrapper')
const OwnerWrapper = require('./plugins/owner-wrapper')
const PurseWrapper = require('./plugins/purse-wrapper')
const StateWrapper = require('./plugins/state-wrapper')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Run'

// ------------------------------------------------------------------------------------------------
// Run
// ------------------------------------------------------------------------------------------------

/**
 * The Run class that the user creates.
 *
 * It is essentially a wrapper around the kernel.
 * It sets up the kernel with users provided options or defaults and exposes an API to the user.
 */
class Run {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (options = {}) {
    if (Log._infoOn) Log._info(TAG, 'Create')

    checkIfOptionsCompatible(options)
    checkIfOptionsCompatible(Run.defaults)

    const keys = Object.keys(options)

    // Setup non-kernel properties
    this._api = parseApi(options.api, keys.includes('api'), options.blockchain || Run.defaults.blockchain, options.network || Run.defaults.network)
    this._apiKey = parseApiKey(options.apiKey, keys.includes('apiKey'))
    this._autofund = parseAutofund(options.autofund, keys.includes('autofund'))
    this._debug = parseDebug(options.debug, keys.includes('debug'))
    this._logger = parseLogger(options.logger, keys.includes('logger'))
    this._networkRetries = parseNetworkRetries(options.networkRetries, keys.includes('networkRetries'))
    this._networkTimeout = parseNetworkTimeout(options.networkTimeout, keys.includes('networkTimeout'))

    const network = parseNetwork(options.network, keys.includes('network'))
    const wallet = parseWallet(options.wallet, keys.includes('wallet'))

    // Setup kernel
    this._kernel = new Kernel()
    this._kernel._backingLimit = parseBackingLimit(options.backingLimit, keys.includes('backingLimit'))
    this._kernel._client = parseClient(options.client, keys.includes('client'))
    this._kernel._cache = parseCache(options.cache, keys.includes('cache'), network)
    this._kernel._blockchain = parseBlockchain(options.blockchain, keys.includes('blockchain'), this._api, this._apiKey, network)
    this._kernel._state = parseState(options.state, keys.includes('state'), network, this._api, this._apiKey)
    this._kernel._purse = parsePurse(options.purse, keys.includes('purse'), this._kernel._blockchain, wallet)
    this._kernel._app = parseApp(options.app, keys.includes('app'))
    this._kernel._owner = parseOwner(options.owner, keys.includes('owner'), this._kernel._blockchain, wallet)
    this._kernel._timeout = parseTimeout(options.timeout, keys.includes('timeout'))
    this._kernel._trustlist = parseTrust(options.trust, keys.includes('trust'))
    this._kernel._preverify = parsePreverify(options.preverify, keys.includes('preverify'))
    this._kernel._rollbacks = parseRollbacks(options.rollbacks, keys.includes('rollbacks'))

    // Hook plugins
    hookPlugins(this)

    // Setup inventory last, because it requires the kernel
    this._inventory = parseInventory(options.inventory, keys.includes('inventory'))

    // If using the mockchain and local purse, automatically fund the purse with some money
    autofundPurse(this)

    this.activate()
  }

  // --------------------------------------------------------------------------
  // Getters
  //
  // These should return the same objects assigned, even if internally we wrap.
  // --------------------------------------------------------------------------

  get api () { return this._api }
  get apiKey () { return this._apiKey }
  get app () { return this._kernel._app }
  get autofund () { return this._autofund }
  get backingLimit () { return this._kernel._backingLimit }
  get blockchain () { return this._kernel._blockchain }
  get cache () { return this._kernel._cache }
  get client () { return this._kernel._client }
  get debug () { return this._debug }
  get inventory () { return this._inventory }
  get logger () { return this._logger }
  get network () { return this.blockchain.network }
  get networkRetries () { return this._networkRetries }
  get networkTimeout () { return this._networkTimeout }
  get owner () { return this._kernel._owner }
  get preverify () { return this._kernel._preverify }
  get purse () { return this._kernel._purse }
  get rollbacks () { return this._kernel._rollbacks }
  get timeout () { return this._kernel._timeout }
  get state () { return this._kernel._state }
  get wallet () { return this._kernel._purse === this._kernel._owner ? this._kernel._purse : undefined }

  // --------------------------------------------------------------------------
  // Setters
  // --------------------------------------------------------------------------

  set api (api) {
    api = parseApi(api, true)
    this._kernel._blockchain = parseBlockchain(undefined, false, api, this._apiKey, this.network)
    this._kernel._state = parseState(undefined, false, this.blockchain.network, api, this._apiKey)
    hookPlugins(this)
    this._api = api
  }

  set apiKey (apiKey) {
    apiKey = parseApiKey(apiKey, true)
    this._kernel._blockchain = parseBlockchain(undefined, false, this._api, apiKey, this.network)
    this._kernel._state = parseState(undefined, false, this.blockchain.network, this._api, apiKey)
    hookPlugins(this)
    this._apiKey = apiKey
  }

  set app (app) {
    this._kernel._app = parseApp(app, true)
  }

  set autofund (autofund) {
    this._autofund = parseAutofund(autofund, true)
    autofundPurse(this)
  }

  set backingLimit (backingLimit) {
    backingLimit = parseBackingLimit(backingLimit, true)
    this._kernel._backingLimit = backingLimit
  }

  set blockchain (blockchain) {
    this._kernel._blockchain = parseBlockchain(blockchain, true)
    this._api = undefined
    this._apiKey = undefined
    if (this._kernel._purse instanceof LocalPurse) {
      this._kernel._purse.blockchain = this._kernel._blockchain
    }
    hookPlugins(this)
    autofundPurse(this)
  }

  set cache (cache) {
    this._kernel._cache = parseCache(cache, true, this.network)
    hookPlugins(this)
  }

  set client (client) {
    this._kernel._client = parseClient(client, true)
  }

  set debug (debug) {
    this._debug = parseDebug(debug, true)
    activateLogger(this)
  }

  set inventory (inventory) {
    if (this._inventory) this._inventory.detach(this)
    this._inventory = parseInventory(inventory, true)
    if (this._inventory) this._inventory.attach(this)
  }

  set logger (logger) {
    this._logger = parseLogger(logger, true)
    activateLogger(this)
  }

  set network (network) {
    parseNetwork(network, true)
    this._kernel._blockchain = parseBlockchain(undefined, false, this._api, this._apiKey, network)
    this._kernel._state = parseState(undefined, false, network, this._api, this._apiKey)
    hookPlugins(this)
  }

  set networkRetries (networkRetries) {
    this._networkRetries = parseNetworkRetries(networkRetries, true)
    if (isActive(this)) request.defaults.retries = this._networkRetries
  }

  set networkTimeout (networkTimeout) {
    this._networkTimeout = parseNetworkTimeout(networkTimeout, true)
    if (isActive(this)) request.defaults.timeout = this._networkTimeout
  }

  set owner (owner) {
    const newOwner = parseOwner(owner, true, this._kernel._blockchain, null)
    if (newOwner === this._kernel._owner) return
    this._kernel._owner = newOwner
    hookPlugins(this)
    if (this._inventory) this._inventory.detach(this)
    this._inventory = new Inventory()
    this._inventory.attach(this)
  }

  set preverify (preverify) {
    this._kernel._preverify = parsePreverify(preverify, true)
  }

  set purse (purse) {
    this._kernel._purse = parsePurse(purse, true, this.blockchain, null)
    hookPlugins(this)
  }

  set rollbacks (rollbacks) {
    this._kernel._rollbacks = parseRollbacks(rollbacks, true)
  }

  set state (state) {
    this._kernel._state = parseState(state, true, this.network, this.api, this.apiKey)
    hookPlugins(this)
  }

  set timeout (timeout) {
    this._kernel._timeout = parseTimeout(timeout, true)
  }

  set wallet (wallet) {
    parseWallet(wallet, true)
    this.purse = wallet
    this.owner = wallet
  }

  // --------------------------------------------------------------------------
  // Methods
  // --------------------------------------------------------------------------

  load (location, options = {}) {
    checkActive(this)
    if (Transaction._ATOMICALLY_UPDATING) throw new Error('load disabled during atomic update')
    if (options.trust) this.trust(location.slice(0, 64))
    return _load(location, undefined, this._kernel)
  }

  sync () {
    if (Transaction._ATOMICALLY_UPDATING) throw new Error('sync all disabled during atomic update')
    return Commit._syncAll()
  }

  deploy (T) {
    checkActive(this)
    const C = install(T)
    Editor._get(C)._deploy()
    return C
  }

  transaction (f) {
    checkActive(this)
    const transaction = new Transaction()
    const ret = transaction.update(f)
    transaction.publish()
    return ret
  }

  import (rawtx, options = {}) {
    if (Transaction._ATOMICALLY_UPDATING) throw new Error('import disabled during atomic update')
    const tx = new bsv.Transaction(rawtx)
    const txid = options.txid || tx.hash
    if (options.trust) this.trust(txid)
    return Transaction._import(tx, txid, this._kernel)
  }

  trust (x) {
    if (x instanceof Array) { x.forEach(y => this.trust(y)); return }
    if (Log._infoOn) Log._info(TAG, 'Trust', x)
    if (!trustable(x)) throw new ArgumentError(`Not trustable: ${_text(x)}`)
    if (x === 'cache') x = 'state'
    this._kernel._trustlist.add(x)
  }

  on (_event, _listener) {
    if (!Kernel._EVENTS.includes(_event)) throw new ArgumentError(`Invalid event: ${_text(_event)}`)
    if (typeof _listener !== 'function') throw new ArgumentError(`Invalid listener: ${_text(_limit)}`)
    if (this._kernel._listeners.some(x => x._event === _event && x._listener === _listener)) return
    this._kernel._listeners.push({ _event, _listener })
  }

  off (event, listener) {
    if (!Kernel._EVENTS.includes(event)) throw new ArgumentError(`Invalid event: ${_text(event)}`)
    if (typeof listener !== 'function') throw new ArgumentError(`Invalid listener: ${_text(listener)}`)
    const matches = x => x._event === event && x._listener === listener
    this._kernel._listeners = this._kernel._listeners.filter(x => !matches(x))
  }

  activate () {
    if (Log._infoOn) Log._info(TAG, 'Activate')

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('activate disabled during atomic update')

    Run.instance = this

    if (this._inventory) this._inventory.attach(this)

    this._kernel._activate()

    // Configure globals defined by this instance by setting their properties here again.
    this.logger = this._logger
    this.debug = this._debug
    this.networkRetries = this._networkRetries
    this.networkTimeout = this._networkTimeout

    return this
  }

  deactivate () {
    if (Log._infoOn) Log._info(TAG, 'Deactivate')

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('deactivate disabled during atomic update')

    Run.instance = null

    if (this._inventory) this._inventory.detach(this)

    this._kernel._deactivate()

    return this
  }
}

Run.instance = null

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function isActive (run) {
  return Kernel._instance === run._kernel
}

// ------------------------------------------------------------------------------------------------

function checkActive (run) {
  if (Kernel._instance !== run._kernel) {
    const hint = 'Hint: Call run.activate() on this instance first'
    throw new Error(`This Run instance is not active\n\n${hint}`)
  }
}

// ------------------------------------------------------------------------------------------------

function autofundPurse (run) {
  if (run.blockchain instanceof Mockchain && run.purse instanceof LocalPurse && run.autofund) {
    run.blockchain.fund(run.purse.bsvAddress, 10000000000)
  }
}

// ------------------------------------------------------------------------------------------------

function hookPlugins (run) {
  if (run._kernel._blockchain instanceof BlockchainWrapper) {
    run._kernel._blockchain.cache = run._kernel._cache
  }

  if (run._kernel._state instanceof StateWrapper) {
    run._kernel._state.cache = run._kernel._cache
  }

  if (run._kernel._purse instanceof PurseWrapper) {
    run._kernel._purse.blockchain = run._kernel._blockchain
  }
}

// ------------------------------------------------------------------------------------------------
// Parameter validation
// ------------------------------------------------------------------------------------------------

function checkIfOptionsCompatible (options) {
  const apiMismatch = options.blockchain && typeof options.api !== 'undefined' && options.blockchain.api !== options.api
  if (apiMismatch) throw new Error(`Blockchain mismatch with "${options.api}" api`)

  const apiKeyMismatch = options.blockchain && typeof options.apiKey !== 'undefined' && options.blockchain.apiKey !== options.apiKey
  if (apiKeyMismatch) throw new Error(`Blockchain mismatch with "${options.apiKey}" apiKey`)

  const networkMismatch = options.blockchain && typeof options.network !== 'undefined' && options.blockchain.network !== options.network
  if (networkMismatch) throw new Error(`Blockchain mismatch with "${options.network}" network`)
}

// ------------------------------------------------------------------------------------------------

function parseApi (api, specified, blockchain, network) {
  if (api === 'run' || api === 'whatsonchain') return api

  if (typeof api === 'undefined' && !specified) {
    if (typeof Run.defaults.api === 'string') {
      return parseApi(Run.defaults.api, true, undefined, network)
    }

    if (typeof blockchain === 'undefined') {
      if (network === 'main' || network === 'test') return 'run'
      if (network === 'stn') return 'whatsonchain'
    }

    return undefined
  }
  throw new Error(`Invalid api: ${_text(api)}`)
}

// ------------------------------------------------------------------------------------------------

function parseApiKey (apiKey, specified) {
  if (typeof apiKey === 'string') return apiKey
  if (typeof apiKey === 'undefined' && !specified) return Run.defaults.apiKey
  throw new Error(`Invalid apiKey: ${_text(apiKey)}`)
}

// ------------------------------------------------------------------------------------------------

function parseApp (app, specified) {
  if (typeof app === 'string') return app
  if (typeof app === 'undefined' && !specified) return parseApp(Run.defaults.app, true)
  throw new Error(`Invalid app: ${_text(app)}`)
}

// ------------------------------------------------------------------------------------------------

function parseAutofund (autofund, specified) {
  if (typeof autofund === 'boolean') return autofund
  if (typeof autofund === 'undefined' && !specified) return parseAutofund(Run.defaults.autofund, true)
  throw new Error(`Invalid autofund: ${_text(autofund)}`)
}

// ------------------------------------------------------------------------------------------------

function parseBackingLimit (backingLimit, specified) {
  if (backingLimit >= 0) return backingLimit
  if (typeof backingLimit === 'undefined' && !specified) return parseBackingLimit(Run.defaults.backingLimit, true)
  throw new Error(`Invalid backingLimit: ${_text(backingLimit)}`)
}

// ------------------------------------------------------------------------------------------------

function parseBlockchain (blockchain, specified, api, apiKey, network, feePerKb) {
  if (blockchain instanceof Blockchain) return blockchain

  const lastBlockchain = Kernel._instance && Kernel._instance._blockchain

  // If no blockchain is passed in, create one
  if (typeof blockchain === 'undefined' && !specified) {
    switch (network) {
      case 'mock':
        if (typeof api !== 'undefined') throw new Error(`"mock" network is not compatible with the "${api}" api`)
        return lastBlockchain instanceof Mockchain ? lastBlockchain : new Mockchain()

      case 'main':
      case 'test':
      case 'stn': {
        const isRemoteBlockchain =
          lastBlockchain instanceof RunConnect ||
          lastBlockchain instanceof WhatsOnChain

        if (isRemoteBlockchain &&
          lastBlockchain.api === api &&
          lastBlockchain.apiKey === apiKey &&
          lastBlockchain.network === network) {
          return lastBlockchain
        }

        const options = { apiKey, network }

        switch (typeof api) {
          case 'string':
            switch (api) {
              case 'run': return new RunConnect(options)
              case 'whatsonchain': return new WhatsOnChain(options)
            }
            break

          case 'undefined':
            // Only whatsonchain supports STN right now
            return network === 'stn' ? new WhatsOnChain(options) : new RunConnect(options)

          default:
            throw new Error(`Invalid api: ${_text(api)}`)
        }
      } break

      default:
        return parseBlockchain(Run.defaults.blockchain, true)
    }
  }

  throw new Error(`Invalid blockchain: ${_text(blockchain)}`)
}

// ------------------------------------------------------------------------------------------------

function parseCache (cache, specified, network) {
  if (cache instanceof Cache) return cache

  if (typeof cache === 'undefined' && !specified) {
    const lastCache = Kernel._instance && Kernel._instance._cache
    const lastBlockchain = Kernel._instance && Kernel._instance._blockchain
    const lastNetwork = lastBlockchain && lastBlockchain.network

    // If our last run instance had a cache on the same network, reuse it
    if (lastCache && lastNetwork === network) {
      return lastCache
    }

    // Otherwise, see if we have a default cache to prefer
    if (Run.defaults.cache instanceof Cache) {
      return Run.defaults.cache
    }

    // No default cache. Create one based on the environment.
    return _browser() ? new BrowserCache() : _nodejs() ? new NodeCache() : new LocalCache()
  }

  if (cache instanceof RunDB) {
    const error = 'The RunDB plugin is now a state provider, not a cache'
    const hint = 'Hint: Try run.state = new RunDB()'
    throw new Error(`${error}\n\n${hint}`)
  }

  throw new Error(`Invalid cache: ${_text(cache)}`)
}

// ------------------------------------------------------------------------------------------------

function parseClient (client, specified) {
  if (typeof client === 'boolean') return client
  if (typeof client === 'undefined' && !specified) return parseClient(Run.defaults.client, true)
  throw new Error(`Invalid client: ${_text(client)}`)
}

// ------------------------------------------------------------------------------------------------

function parseDebug (debug, specified) {
  if (typeof debug === 'boolean') return debug
  if (typeof debug === 'undefined' && !specified) return parseDebug(Run.defaults.debug, true)
  throw new Error(`Invalid debug: ${_text(debug)}`)
}

// ------------------------------------------------------------------------------------------------

function parseInventory (inventory, specified) {
  if (inventory instanceof Inventory) return inventory
  if (specified) throw new Error(`Invalid inventory: ${_text(inventory)}`)
  return new Inventory()
}

// ------------------------------------------------------------------------------------------------

function parseLogger (logger, specified) {
  if (logger instanceof Logger) return logger
  if (logger === null) return null
  if (typeof logger === 'undefined' && !specified) return Run.defaults.logger
  throw new Error(`Invalid logger: ${_text(logger)}`)
}

// ------------------------------------------------------------------------------------------------

function parseNetwork (network, specified) {
  if (network === 'mock' || network === 'main' || network === 'test' || network === 'stn') return network
  if (typeof network === 'undefined' && !specified) return Run.defaults.network
  throw new Error(`Invalid network: ${_text(network)}`)
}

// ------------------------------------------------------------------------------------------------

function parseNetworkRetries (networkRetries, specified) {
  if (networkRetries >= 0 && Number.isSafeInteger(networkRetries)) return networkRetries
  if (typeof networkRetries === 'undefined' && !specified) return parseNetworkRetries(Run.defaults.networkRetries, true)
  throw new Error(`Invalid network retries: ${_text(networkRetries)}`)
}

// ------------------------------------------------------------------------------------------------

function parseNetworkTimeout (networkTimeout, specified) {
  if (typeof networkTimeout === 'number' && networkTimeout >= 0 && !Number.isNaN(networkTimeout)) return networkTimeout
  if (typeof networkTimeout === 'undefined' && !specified) return parseNetworkTimeout(Run.defaults.networkTimeout, true)
  throw new Error(`Invalid network timeout: ${_text(networkTimeout)}`)
}

// ------------------------------------------------------------------------------------------------

function parseOwner (owner, specified, blockchain, wallet) {
  if (wallet) {
    if (owner && specified && owner !== wallet) throw new Error('Cannot set different owner and wallet')
    return wallet
  }

  if (owner instanceof Owner) return owner

  // If user didn't specify an owner, create one
  if (typeof owner === 'undefined' && !specified) {
    if (Run.defaults.owner instanceof Owner) {
      return Run.defaults.owner
    }

    if (typeof Run.defaults.owner === 'string' || Run.defaults.owner instanceof PrivateKey) {
      try {
        return new LocalOwner(Run.defaults.owner, blockchain.network)
      } catch (e) { }
    }

    return new LocalOwner(undefined, blockchain.network)
  }

  // If user did specify an owner, see if it's a private key
  if (typeof owner === 'string' || owner instanceof PrivateKey) {
    try {
      return new LocalOwner(owner, blockchain.network)
    } catch (e) { /* no-op */ }
  }

  // Try creating Viewer from public keys and addresses
  if (typeof owner === 'string' || owner instanceof PublicKey || owner instanceof Address) {
    try {
      return new Viewer(owner.toString(), blockchain.network)
    } catch (e) { /* no-op */ }
  }

  // Try creating Viewer from a custom lock
  if (typeof owner === 'object') {
    try {
      return new Viewer(owner)
    } catch (e) { /* no-op */ }
  }

  throw new Error(`Invalid owner: ${_text(owner)}`)
}

// ------------------------------------------------------------------------------------------------

function parsePreverify (preverify, specified) {
  if (typeof preverify === 'boolean') return preverify
  if (typeof preverify === 'undefined' && !specified) return parsePreverify(Run.defaults.preverify, true)
  throw new Error(`Invalid preverify: ${_text(preverify)}`)
}

// ------------------------------------------------------------------------------------------------

function parsePurse (purse, specified, blockchain, wallet) {
  if (wallet) {
    if (purse && specified && purse !== wallet) throw new Error('Cannot set different purse and wallet')
    return wallet
  }

  if (purse instanceof Purse) return purse

  // If user did not specify a purse, create one
  if (typeof purse === 'undefined' && !specified) {
    if (Run.defaults.purse instanceof Purse) {
      return Run.defaults.purse
    }

    if (typeof Run.defaults.purse === 'string' || Run.defaults.purse instanceof PrivateKey) {
      try {
        return new LocalPurse({ privkey: Run.defaults.purse, blockchain })
      } catch (e) { }
    }

    return new LocalPurse({ blockchain })
  }

  // See if the purse is a private key
  if (typeof purse === 'string' || purse instanceof PrivateKey) {
    try {
      return new LocalPurse({ privkey: purse, blockchain })
    } catch (e) { /* no-op */ }
  }

  throw new Error(`Invalid purse: ${_text(purse)}`)
}

// ------------------------------------------------------------------------------------------------

function parseRollbacks (rollbacks, specified) {
  if (typeof rollbacks === 'boolean') return rollbacks
  if (typeof rollbacks === 'undefined' && !specified) return parseRollbacks(Run.defaults.rollbacks, true)
  throw new Error(`Invalid rollbacks: ${_text(rollbacks)}`)
}

// ------------------------------------------------------------------------------------------------

function parseState (state, specified, network, api, apiKey) {
  if (state instanceof State) return state

  if (typeof state === 'undefined' && !specified) {
    const lastState = Kernel._instance && Kernel._instance._state
    const lastBlockchain = Kernel._instance && Kernel._instance._blockchain
    const lastNetwork = lastBlockchain && lastBlockchain.network
    const lastApi = lastState && lastState.api
    const lastApiKey = lastState && lastState.apiKey

    // If our last run instance had a state on the same network and api, reuse it
    if (lastState && lastNetwork === network && lastApi === api && lastApiKey === apiKey) {
      return lastState
    }

    // See if we have a default state to prefer
    if (Run.defaults.state instanceof State) {
      return Run.defaults.state
    }

    // If we are on mainnet or testnet, then use Run's State Server
    if (network === 'main' || network === 'test') {
      apiKey = api === 'run' ? apiKey : undefined
      return new StateServer({ apiKey })
    }

    // Otheruse, use local state
    return new LocalState()
  }

  throw new Error(`Invalid state: ${_text(state)}`)
}

// ------------------------------------------------------------------------------------------------

function parseTimeout (timeout, specified) {
  if (typeof timeout === 'number' && timeout >= 0 && !Number.isNaN(timeout)) return timeout

  if (typeof timeout === 'undefined' && !specified) {
    return Run.defaults.timeout
  }

  throw new Error(`Invalid timeout: ${_text(timeout)}`)
}

// ------------------------------------------------------------------------------------------------

function parseTrust (trust, specified) {
  let all = []

  if (typeof trust === 'string') {
    // If user wants to trust a single entry, add it
    if (!trustable(trust)) throw new Error(`Not trustable: ${_text(trust)}`)
    if (trust === 'cache') trust = 'state'
    all.push(trust)
  } else if (Array.isArray(trust)) {
    // If user wants to trust an array, add them all
    for (const x of trust) {
      if (!trustable(x)) {
        throw new Error(`Not trustable: ${_text(x)}`)
      }
    }
    all = all.concat(trust.map(x => x === 'cache' ? 'state' : x))
  } else if (typeof trust === 'undefined' && !specified) {
    // If user wants to use the defaults, pull from previous instance
    const lastTrusts = Kernel._instance && Kernel._instance._trustlist
    if (lastTrusts) {
      all = all.concat(Array.from(lastTrusts))
    } else if (Run.defaults.trust) {
      // If no previous instance, pull from defaults
      all = all.concat(Array.from(parseTrust(Run.defaults.trust, true)))
    }
  } else {
    throw new Error(`Not trustable: ${_text(trust)}`)
  }

  // Merge with our trustlist
  const defaultTrustlist = [
    /**
     * Run ▸ Extras
     */
    '61e1265acb3d93f1bf24a593d70b2a6b1c650ec1df90ddece8d6954ae3cdd915', // asm
    '49145693676af7567ebe20671c5cb01369ac788c20f3b1c804f624a1eda18f3f', // asm
    '284ce17fd34c0f41835435b03eed149c4e0479361f40132312b4001093bb158f', // asm
    '6fe169894d313b44bd54154f88e1f78634c7f5a23863d1713342526b86a39b8b', // B
    '5332c013476cd2a2c18710a01188695bc27a5ef1748a51d4a5910feb1111dab4', // B (v2)
    '81bcef29b0e4ed745f3422c0b764a33c76d0368af2d2e7dd139db8e00ee3d8a6', // Base58
    '71fba386341b932380ec5bfedc3a40bce43d4974decdc94c419a94a8ce5dfc23', // expect
    '780ab8919cb89323707338070323c24ce42cdec2f57d749bd7aceef6635e7a4d', // Group
    '90a3ece416f696731430efac9657d28071cc437ebfff5fb1eaf710fe4b3c8d4e', // Group
    '727e7b423b7ee40c0b5be87fba7fa5673ea2d20a74259040a7295d9c32a90011', // Hex
    '3b7ef411185bbe3d01caeadbe6f115b0103a546c4ef0ac7474aa6fbb71aff208', // sha256
    'b17a9af70ab0f46809f908b2e900e395ba40996000bf4f00e3b27a1e93280cf1', // Token (v1)
    '72a61eb990ffdb6b38e5f955e194fed5ff6b014f75ac6823539ce5613aea0be8', // Token (v2)
    '312985bd960ae4c59856b3089b04017ede66506ea181333eec7c9bb88b11c490', // Tx, txo
    '05f67252e696160a7c0099ae8d1ec23c39592378773b3a5a55f16bd1286e7dcb', // txo, Tx, B(v2)

    /**
     * RelayX
     */
    'd792d10294a0d9b05a30049f187a1704ced14840ecf41d00663d79c695f86633', // USDC
    '318d2a009e29cb3a202b2a167773341dcd39809b967889a7e306d504cc266faf', // OKBSV
    '5a8d4b4da7c5f27a39adac3a9256a7e15e03a7266c81ac8369a3b634560e7814', // OKBSV
    'd7273b6790a4dec4aa116661aff0ec35381794e552807014ca6a536f4454976d', // OKBSV
    'd6170025a62248d8df6dc14e3806e68b8df3d804c800c7bfb23b0b4232862505', // OrderLock

    /**
     * Tokens
     */
    'ce8629aa37a1777d6aa64d0d33cd739fd4e231dc85cfe2f9368473ab09078b78', // SHUA
    'ca1818540d2865c5b6a53e06650eafadc10b478703aa7cf324145f848fec629b', // SHUA
    '1de3951603784df7c872519c096445a415d9b0d3dce7bbe3b7a36ca82cf1a91c', // SHUA
    '367b4980287f8abae5ee4b0c538232164d5b2463068067ec1e510c91114bced2', // SHUA

    /**
     * Run ▸ Extras (testnet)
     */
    '1f0abf8d94477b1cb57629d861376616f6e1d7b78aba23a19da3e6169caf489e', // asm, Hex
    '8b9380d445b6fe01ec7230d8363febddc99feee6064d969ae8f98fdb25e1393f', // asm
    '03e21aa8fcf08fa6985029ad2e697a2309962527700246d47d891add3cfce3ac', // asm
    '5435ae2760dc35f4329501c61c42e24f6a744861c22f8e0f04735637c20ce987', // B
    'b44a203acd6215d2d24b33a41f730e9acf2591c4ae27ecafc8d88ef83da9ddea', // B (v2)
    '424abf066be56b9dd5203ed81cf1f536375351d29726d664507fdc30eb589988', // Base58
    'f97d4ac2a3d6f5ed09fad4a4f341619dc5a3773d9844ff95c99c5d4f8388de2f', // expect
    '63e0e1268d8ab021d1c578afb8eaa0828ccbba431ffffd9309d04b78ebeb6e56', // Group
    '03320f1244e509bb421e6f1ff724bf1156182890c3768cfa4ea127a78f9913d2', // Group
    '4a1929527605577a6b30710e6001b9379400421d8089d34bb0404dd558529417', // sha256
    '0bdf33a334a60909f4c8dab345500cbb313fbfd50b1d98120227eae092b81c39', // Token (v1)
    '7d14c868fe39439edffe6982b669e7b4d3eb2729eee7c262ec2494ee3e310e99', // Token (v2)
    '33e78fa7c43b6d7a60c271d783295fa180b7e9fce07d41ff1b52686936b3e6ae', // Tx, txo
    'd476fd7309a0eeb8b92d715e35c6e273ad63c0025ff6cca927bd0f0b64ed88ff', // Tx, txo, B (v2)

    /**
     * Other
     */
    '24cde3638a444c8ad397536127833878ffdfe1b04d5595489bd294e50d77105a', // B (old)
    'bfa5180e601e92af23d80782bf625b102ac110105a392e376fe7607e4e87dc8d', // Class with logo
    'c0a79e8afb7cabe5f25bdaa398683d6dfe68a2912b29fe948ed130d14e3a2380', // TimeLock
    '3f9de452f0c3c96be737d42aa0941b27412211976688967adb3174ee18b04c64' // Tutorial jigs
  ]

  return new Set(all.concat(defaultTrustlist))
}

// ------------------------------------------------------------------------------------------------

function parseWallet (wallet, specified) {
  if (typeof wallet === 'undefined' && !specified) return wallet
  if (typeof wallet !== 'object' || wallet === null) throw new Error(`Invalid wallet: ${_text(wallet)}`)
  if (!(wallet instanceof Owner)) throw new Error('wallet does not implement the Owner API')
  if (!(wallet instanceof Purse)) throw new Error('wallet does not implement the Purse API')
  return wallet
}

// ------------------------------------------------------------------------------------------------

function trustable (x) {
  if (x === '*') return true
  if (x === 'cache') return true
  if (x === 'state') return true
  if (typeof x !== 'string') return false
  if (x.length !== 64) return false
  return /[a-fA-F0-9]+/.test(x)
}

// ------------------------------------------------------------------------------------------------

function activateLogger (run) {
  if (!isActive(run)) return
  const logger = {}
  if (run._logger && run._logger.info) logger.info = run._logger.info.bind(run._logger)
  if (run._logger && run._logger.warn) logger.warn = run._logger.warn.bind(run._logger)
  if (run._logger && run._logger.error) logger.error = run._logger.error.bind(run._logger)
  if (run._logger && run._logger.debug && run._debug) logger.debug = run._logger.debug.bind(run._logger)
  Log._logger = logger
}

// ------------------------------------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------------------------------------

// Default settings that Run uses when an option is not provided or undefined
Run.defaults = {}
Run.defaults.api = undefined
Run.defaults.apiKey = undefined
Run.defaults.app = ''
Run.defaults.autofund = true
Run.defaults.backingLimit = 100000000
Run.defaults.blockchain = undefined
Run.defaults.cache = undefined
Run.defaults.client = false
Run.defaults.debug = false
Run.defaults.inventory = undefined
Run.defaults.logger = { warn: console.warn, error: console.error }
Run.defaults.network = 'main'
Run.defaults.networkRetries = 2
Run.defaults.networkTimeout = 10000
Run.defaults.owner = undefined
Run.defaults.preverify = true
Run.defaults.purse = undefined
Run.defaults.rollbacks = true
Run.defaults.state = undefined
Run.defaults.timeout = 30000
Run.defaults.trust = []

// ------------------------------------------------------------------------------------------------
// configure
// ------------------------------------------------------------------------------------------------

/**
 * Configures the Run defaults
 */
Run.configure = (env, network) => {
  Run.defaults = Object.assign({}, Run.defaults)

  // App
  if (env.APP) Run.defaults.app = env.APP

  // Network
  network = network || env.NETWORK || Run.defaults.network
  Run.defaults.network = network

  // Logger
  if (env.LOGGER === 'debug') {
    Run.defaults.logger = console
    Run.defaults.debug = true
  } else if (env.LOGGER && JSON.parse(env.LOGGER)) {
    Run.defaults.logger = console
    Run.defaults.debug = false
  } else if (env.LOGGER && !JSON.parse(env.LOGGER)) {
    Run.defaults.logger = { }
  }
  Log._logger = Run.defaults.logger

  // Purse
  const purse = env.PURSE || env[`PURSE_${network.toUpperCase()}`]
  if (typeof purse !== 'undefined') Run.defaults.purse = purse

  // Owner
  const owner = env.OWNER || env[`OWNER_${network.toUpperCase()}`]
  if (typeof owner !== 'undefined') Run.defaults.owner = owner

  // Api
  if (typeof env.API !== 'undefined') Run.defaults.api = env.API

  // Api key
  const apiKey = env.APIKEY || env[`APIKEY_${(Run.defaults.api || '').toUpperCase()}`]
  if (typeof apiKey !== 'undefined') Run.defaults.apiKey = apiKey
}

// ------------------------------------------------------------------------------------------------
// install
// ------------------------------------------------------------------------------------------------

function install (T) {
  const C = Editor._lookupCodeByType(T) || Editor._createCode()
  const editor = Editor._get(C)
  if (!Run.instance) {
    editor._preinstall(T)
  } else if (!editor._installed) {
    editor._install(T)
  }
  return C
}

// ------------------------------------------------------------------------------------------------
// uninstall
// ------------------------------------------------------------------------------------------------

function uninstall (T) {
  const C = Editor._lookupCodeByType(T)
  if (!C) return
  const editor = Editor._get(C)
  editor._uninstall()
}

// ------------------------------------------------------------------------------------------------
// unify
// ------------------------------------------------------------------------------------------------

function unify (...creations) {
  if (!creations.length) throw new ArgumentError('No creations to unify')
  if (creations.some(creation => !(creation instanceof Creation))) throw new ArgumentError('Must only unify creations')
  _unifyForMethod(creations, creations)
}

// ------------------------------------------------------------------------------------------------
// cover
// ------------------------------------------------------------------------------------------------

// Enables collecting code coverage for a class or function
// load() and import() are not supported in cover tests, and there may be random bugs
Run.cover = name => { if (!Sandbox._cover.includes(name)) Sandbox._cover.push(name) }

// ------------------------------------------------------------------------------------------------
// Additional exports
// ------------------------------------------------------------------------------------------------

// Kernel
Run.Berry = Berry
Run.Code = Code
Run.Jig = Jig
Run.Creation = Creation
Run.Transaction = Transaction

// Plugins
Run.plugins = {}
Run.plugins.BrowserCache = BrowserCache
Run.plugins.DiskCache = DiskCache
Run.plugins.IndexedDbCache = IndexedDbCache
Run.plugins.Inventory = Inventory
Run.plugins.LocalCache = LocalCache
Run.plugins.LocalOwner = LocalOwner
Run.plugins.LocalPurse = LocalPurse
Run.plugins.LocalState = LocalState
Run.plugins.Mockchain = Mockchain
Run.plugins.NodeCache = NodeCache
Run.plugins.PayServer = PayServer
Run.plugins.RunConnect = RunConnect
Run.plugins.RunDB = RunDB
Run.plugins.StateServer = StateServer
Run.plugins.Viewer = Viewer
Run.plugins.WhatsOnChain = WhatsOnChain

// Wrappers
Run.plugins.BlockchainWrapper = BlockchainWrapper
Run.plugins.CacheWrapper = CacheWrapper
Run.plugins.OwnerWrapper = OwnerWrapper
Run.plugins.PurseWrapper = PurseWrapper
Run.plugins.StateWrapper = StateWrapper

// Extra
Run.extra = require('./extra')

// Hidden
Run._admin = require('./kernel/admin')._admin
Run._Bindings = require('./kernel/bindings')
Run._bsv = require('./kernel/bsv')
Run._CreationSet = require('./kernel/creation-set')
Run._deep = require('./kernel/deep')
Run._determinism = require('./kernel/determinism')
Run._DeterministicRealm = require('./kernel/realm')
Run._Dynamic = require('./kernel/dynamic')
Run._EDITORS = require('./kernel/editor')._EDITORS
Run._environment = require('./kernel/environment')
Run._Json = require('./kernel/json')
Run._Log = require('./kernel/log')
Run._Membrane = require('./kernel/membrane')
Run._misc = require('./kernel/misc')
Run._Proxy2 = require('./kernel/proxy2')
Run._RecentBroadcasts = require('./plugins/recent-broadcasts')
Run._Record = require('./kernel/record')
Run._request = require('./plugins/request')
Run._RESERVED_PROPS = require('./kernel/misc')._RESERVED_PROPS
Run._RESERVED_CODE_PROPS = require('./kernel/misc')._RESERVED_CODE_PROPS
Run._RESERVED_JIG_PROPS = require('./kernel/misc')._RESERVED_JIG_PROPS
Run._Rules = require('./kernel/rules')
Run._Sandbox = Sandbox
Run._SerialTaskQueue = require('./kernel/queue')
Run._sighash = require('./kernel/bsv')._sighash
Run._Snapshot = require('./kernel/snapshot')
Run._source = require('./kernel/source')
Run._StateFilter = require('./plugins/state-filter')
Run._sudo = require('./kernel/admin')._sudo
Run._version = require('./kernel/version')

// Api
Run.api = {}
Run.api.Blockchain = Blockchain
Run.api.Logger = Logger
Run.api.Purse = Purse
Run.api.Cache = Cache
Run.api.Lock = Lock
Run.api.Owner = Owner
Run.api.State = State

// Errors
Run.errors = require('./kernel/error')
Run.errors.RequestError = require('./plugins/request')._RequestError

// Util
Run.util = {}
Run.util.CommonLock = CommonLock
Run.util.deps = rawtx => {
  if (typeof rawtx !== 'string' || !rawtx.length) throw new Error(`Invalid transaction: ${_text(rawtx)}`)
  return _extractTxDeps(new bsv.Transaction(rawtx))
}
Run.util.metadata = rawtx => {
  if (typeof rawtx !== 'string' || !rawtx.length) throw new Error(`Invalid transaction: ${_text(rawtx)}`)
  return _extractMetadata(new bsv.Transaction(rawtx))
}
Run.util.install = install
Run.util.recreateJigsFromStates = require('./kernel/recreate-sync')
Run.util.unify = unify
Run.util.uninstall = uninstall
Object.defineProperty(Run.util, 'sha256', {
  get: () => Kernel._sha256,
  set: (x) => {
    if (typeof x !== 'function') {
      throw new Error(`'Invalid sha256: ${_text(x)}`)
    }
    Kernel._sha256 = x
  },
  configurable: true,
  enumerable: true
})

/* global VERSION */
Run.version = (typeof VERSION !== 'undefined' && VERSION) || require('../package').version
Run.protocol = require('./kernel/version')._PROTOCOL_VERSION

// Add the bsv library Run uses as a property for now. Later, when we move away from bsv lib,
// we should remove this, but it serves a purpose today, for example setting fees rates.
Run.bsv = bsv

// ------------------------------------------------------------------------------------------------

module.exports = Run
