/**
 * api.js
 *
 * External APIs whose implementations may be plugged into the kernel.
 *
 * APIs should not implement consensus-critical logic. These are add-ons to the core.
 */

const { NotImplementedError } = require('./error')

// ------------------------------------------------------------------------------------------------
// Blockchain
// ------------------------------------------------------------------------------------------------

/**
 * The API the kernel uses to interface with the blockchain
 */
class Blockchain {
  /**
   * Friendly network string.
   *
   * This is usually one of 'main', 'test', 'stn', or 'mock', however it may be any string.
   * If the network starts with 'main', the Run library will use mainnet settings wherever it
   * matters. For all other networks, Run will use testnet settings.
   *
   * @returns {string} Network string
   */
  get network () { throw new NotImplementedError() }

  /**
   * Submits a transaction to the network
   *
   * @param {string} rawtx Transaction in hex format
   * @returns {string} Transaction ID in hex format
   */
  async broadcast (rawtx) { throw new NotImplementedError() }

  /**
   * Queries the network for a transaction
   *
   * @param {string} txid Transaction ID
   * @returns {string} Transaction in hex format
   */
  async fetch (txid) { throw new NotImplementedError() }

  /**
   * Queries the utxos for a particular output script
   *
   * Often times, implementations will index UTXOs by the script's hash, rather than the
   * original script, especially after Genesis, because script hashes are fixed in length. The
   * script hash is calculated via
   *
   *    sha256(new Script(script).toBuffer()).reverse().toString('hex')
   *
   * We don't pass in a script hash though to support partial compatibility. Blockchain APIs
   * that only support querying for addresses may still be used when we can parse the script.
   *
   * @param {string} script Locking script to query in hex
   * @returns {Array<{txid: string, vout: number, script: string, satoshis: number}>} UTXOs
   */
  async utxos (script) { throw new NotImplementedError() }

  /**
   * Gets the block time that a transaction was confirmed, or the mempool acceptance time if not
   * yet in a block, in milliseconds since the unix epoch.
   *
   * @param {string} txid Transaction ID to check
   * @returns {number} Transaction time in milliseconds since the unix epoch
   */
  async time (txid) { throw new NotImplementedError() }

  /**
   * Gets the transaction that spends the output passed
   *
   * @param {string} txid Transaction ID
   * @param {number} vout Output index
   * @returns {?string} Spending transaction ID, or null if unspent
   */
  async spends (txid, vout) { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Blockchain
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    if (typeof instance.network !== 'string') return false
    if (typeof instance.broadcast !== 'function') return false
    if (typeof instance.fetch !== 'function') return false
    if (typeof instance.utxos !== 'function') return false
    if (typeof instance.time !== 'function') return false
    if (typeof instance.spends !== 'function') return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------
// Cache
// ------------------------------------------------------------------------------------------------

/**
 * API to store jig state, transactions, and other data locally.
 *
 * Keys are specially formatted with a prefix:
 *
 *      tx://<txid>               transaction in hex                        hex string
 *      time://<txid>             transaction time in ms since unix epoch   number
 *      spend://<location>        spending transaction id                   txid string
 *      jig://<location>          jig state at a particular location        <state json>
 *      berry://<location>        berry state at a particular location      <state json>
 *      trust://<txid>            whether a txid should be trusted          true, false, or undefined
 *      ban://<location>          whether a jig should not be loaded        { reason, ?untrusted } if banned, or falsey
 *      config://<key>            local configuration setting               <depends>
 *
 * Configuration keys include:
 *
 *      config://code-filter        StateFilter of code stored in the cache
 *      config://recent-broadcasts  Array of recently broadcasted transaction
 *
 * config:// keys should be preserved over other keys if possible if cache entries are deleted.
 *
 * All values are JSON-serializable. However, they should not be modified or created by hand.
 */
class Cache {
  /**
   * Gets an entry from the cache
   *
   * If this is an LRU cache, get() should also bump the key to the front.
   *
   * @param {string} key Key string
   * @returns JSON-serializable value, or undefined if it does not exist
   */
  async get (key) { throw new NotImplementedError() }

  /**
   * Saves an entry into the cache
   *
   * @param {string} key Jig location to save
   * @param {object} value JSON-serializable value
   */
  async set (key, value) { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Cache
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    if (typeof instance.get !== 'function') return false
    if (typeof instance.set !== 'function') return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------
// Lock
// ------------------------------------------------------------------------------------------------

/**
 * An object that can be turned into a Bitcoin output script
 *
 * Locks may be assigned as owners on jigs to give them non-standard ownership rules. They
 * may be created inside jigs, or passed as arguments to a method. For example:
 *
 *    token.send(new Group(2, pubkeys))
 *
 * Therefore, locks must be serializable. That means no `bsv` library objects may be stored,
 * like bsv.Address, etc. Only simple types that you could save in a Jig.
 *
 * The script property should calculate the output script each time it is called from the
 * properties defined on the object. This lets other code depend on these properties and know
 * the output script is deterministically generated from them.
 */
class Lock {
  /**
   * Gets the locking script hex
   * @returns {string} Script hex
   */
  script () { throw new NotImplementedError() }

  /**
   * Gets an upper bound on the unlocking script size, for calculating purse fees.
   * @returns {number} Maximum unlocking script size in bytes
   */
  domain () { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Lock
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' || !instance) return false

    // Make sure script is a function
    if (typeof instance.constructor.prototype.script !== 'function') return false

    // Make sure the script is not otherwise defined on the object
    if (Object.getOwnPropertyNames(instance).includes('script')) return false

    // Make sure the script returned is a hex string
    const script = instance.script()
    if (script.length % 2 !== 0) return false
    const HEX_CHARS = '01234567890abcdefABCDEF'.split('')
    if (script.split('').some(x => !HEX_CHARS.includes(x))) return false

    // Make sure domain is a function or undefined
    const domain = instance.constructor.prototype.domain
    if (typeof domain !== 'function') return false

    // Make sure domain is not otherwise defined on the object
    if (Object.getOwnPropertyNames(instance).includes('domain')) return false

    // Make sure domain returns a non-negative integer
    if (!Number.isSafeInteger(instance.domain())) return false
    if (instance.domain() < 0) return false

    return true
  }
}

// ------------------------------------------------------------------------------------------------
// Logger
// ------------------------------------------------------------------------------------------------

/**
 * The API the kernel uses to log internal messages.
 *
 * This is a subset of `console`, and wherever logger is used, console may be used instead.
 */
class Logger {
  info (...args) { /* no-op */ }
  debug (...args) { /* no-op */ }
  warn (...args) { /* no-op */ }
  error (...args) { /* no-op */ }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Logger
   */
  static [Symbol.hasInstance] (instance) {
    if (Array.isArray(instance)) return false
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------
// Owner
// ------------------------------------------------------------------------------------------------

/**
 * API used to sign transactions with particular locks
 */
class Owner {
  /**
   * Signs the jig inputs of a transaction.
   *
   * The first two parameters are useful for reconstructing the transaction, and the third may
   * be used to determine which inputs to sign.
   *
   * @param {string} rawtx Transaction to sign in serialized hex format
   * @param {Array<?{satoshis: number, script: string}>} parents Array of UTXOs spent in this
   *    transaction mapped 1-1 with the inputs. If a UTXO is undefined, then Run doesn't know
   *    about this input and/or it is not relevant to the method.
   * @param {Array<?Lock>} locks Array of jig owners. Each jig input will have a lock in this
   *    array. Each lock is essentially a higher-level representation of the script.
   * @returns {string} Signed transaction in raw hex format
   */
  async sign (rawtx, parents, locks) { throw new NotImplementedError() }

  /**
   * Returns the next owner value assigned to new jigs.
   *
   * If an array, then the first owner will be used to create new jigs.
   * @returns {string|Lock|Array<string|Lock>} Address, pubkey, or lock, or an array of them
   */
  async nextOwner () { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Key
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    if (typeof instance.sign !== 'function') return false
    // owner() is deprecated but we still support it in 0.6
    if (typeof instance.nextOwner !== 'function' &&
      typeof instance.owner !== 'function') return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------
// Purse
// ------------------------------------------------------------------------------------------------

/**
 * The API the kernel uses to pay for transactions
 */
class Purse {
  /**
   * Adds inputs and outputs to pay for a transaction, and then signs the tx.
   *
   * The partial transaction passed will likely not be acceptable to miners. It will not have
   * enough fees, and the unlocking scripts for jigs will be placeholders until the tx is signed.
   *
   * @param {string} rawtx Transaction to sign in serialized hex format
   * @param {Array<{satoshis: number, script: string}>} parents Array of spent UTXOs spent in this
   *    transaction mapped 1-1 with the inputs
   * @returns {string} Paid transaction in raw hex format
   */
  async pay (rawtx, parents) { throw new NotImplementedError() }

  /**
   * Request to the purse to broadcast the transaction so that it knows UTXOs were spent.
   *
   * This is called before Blockchain.broadcast(), and any errors will cancel the transaction.
   *
   * This method is optional.
   *
   * @param {string} rawtx Transaction to broadcast in serialized hex
   */
  async broadcast (rawtx) { throw new NotImplementedError() }

  /**
   * Notification that the transaction will not be broadcasted by Run anymore.
   *
   * This method is optional. It also cannot be relied upon 100% of the time to be
   * called after pay(), because the user may export the transaction and broadcast
   * it separately.
   *
   * @param {string} rawtx Transaction which was previously returned from pay()
   */
  async cancel (rawtx) { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of Purse
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    if (typeof instance.pay !== 'function') return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------
// State
// ------------------------------------------------------------------------------------------------

/**
 * API that Run uses to fetch higher-level information about jigs efficiently
 */
class State {
  /**
   * Fetches previously calculated states
   *
   * The protocols that may be fetched are the same as the cache, except for config://.
   *
   * This method is required
   * @param {string} key Cache key to query
   * @param {?object} options Optional parameters to more efficiently query related states
   * @param {?boolean} options.all Whether to also fetch and cache all related state needed to use the state
   * @param {?boolean} options.tx Whether to also fetch and cache corresponding tx:// entries for states
   * @param {?string} options.filter Base64 state filter string to eliminate results when all=true
   * @returns {?object} Stored value, or undefined is missing
   */
  async pull (key, options) { throw new NotImplementedError() }

  /**
   * Returns the UTXO locations for jigs owned by a particular locking script
   *
   * This method is optional
   * @param {string} script UTXO locking script owner hex string
   * @returns {Array<string>} Array of locations for the given script, which may be empty
   */
  async locations (script) { throw new NotImplementedError() }

  /**
   * Called when a transaction is broadcasted so that the state server may index it.
   *
   * This method is optional
   * @param {string} rawtx Hex string for raw transaction
   */
  async broadcast (rawtx) { throw new NotImplementedError() }

  /**
   * @returns {boolean} Whether instance is a valid implementation of State
   */
  static [Symbol.hasInstance] (instance) {
    if (typeof instance !== 'object' && typeof instance !== 'function') return false
    if (!instance) return false
    if (typeof instance.pull !== 'function') return false
    return true
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  Blockchain,
  Cache,
  Lock,
  Logger,
  Owner,
  Purse,
  State
}
