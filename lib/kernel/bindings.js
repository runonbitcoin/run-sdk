/**
 * bindings.js
 *
 * Helpers to parse bindings
 *
 * Bindings are the properties on a creation that link it to the blockchain. Some bindings
 * are configurable. Other bindings are set only by Run. There are five supported bindings
 * that can be divided into two categories:
 *
 *    Location bindings - identify place and time for the creation
 *
 *      location - Current location
 *      origin - Starting location
 *      nonce - Number of transactions
 *
 *    UTXO bindings - describe UTXO-specific properties
 *
 *      owner - Owner Lock
 *      satoshis - satoshis value
 *
 * UTXO bindings are configurable by jig code. Location bindings are always set by Run.
 */

const bsv = require('bsv')
const { _text, _setOwnProperty, _defined, _assert, _activeKernel } = require('./misc')
const { _sudo } = require('./admin')
const { _version } = require('./version')

// ------------------------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------------------------

/**
 * The maximum amount of satoshis able to be set on a blockchain object. Currently 1 BSV. We
 * restrict this today for security. There will be an option to disable this in the future.
 */
const MAX_SATOSHIS = 100000000

// Location regexes
const ERROR_LOCATION = /^(?<protocol>error):\/\/(?<error>.*)/s
const NATIVE_LOCATION = /^(?<protocol>native):\/\/(?<native>[a-zA-Z0-9_$]+)/s
const RECORD_LOCATION = /^(?<protocol>record):\/\/(?<record>[a-f0-9]{64})_(?:o(?<vout>[0-9]+)|(?:d(?<vdel>[0-9]+)))$/
const JIG_LOCATION = /^(?<txid>[a-f0-9]{64})?_(?:(?:o(?<vout>[0-9]+))|(?:d(?<vdel>[0-9]+)))$/s
const BERRY_LOCATION = /^(?<txid>[a-f0-9]{64})_(?:(?:o(?<vout>[0-9]+))|(?:d(?<vdel>[0-9]+)))(?:\?berry=(?<berry>[a-zA-Z0-9\-_.!~*'()%]*)(&hash=(?<hash>[a-f0-9]{64}))?(&version=(?<version>[1-9][0-9]*))?)?$/s

// List of properties that are reserved for bindings
const _LOCATION_BINDINGS = ['location', 'origin', 'nonce']
const _UTXO_BINDINGS = ['owner', 'satoshis']
const _BINDINGS = _LOCATION_BINDINGS.concat(_UTXO_BINDINGS)

// Properties when not deployed
const _UNDEPLOYED_LOCATION = 'error://Undeployed'
const _UNDEPLOYED_NONCE = 0
const _UNDEPLOYED_OWNER = undefined
const _UNDEPLOYED_SATOSHIS = undefined

// ------------------------------------------------------------------------------------------------
// _location
// ------------------------------------------------------------------------------------------------

/**
 * Parses a location string
 *
 * Locations are URLs for the blockchain. Run uses them to uniquely and deterministically identify
 * blockchain objects. They are also designed to be double-clickable in browsers and consistently
 * lower-case. The allowed characters in user-facing locations are a-z, 0-9 and _.
 *
 * The most basic location is a jig location. It is a transaction id and an output index:
 *
 *    0000000000000000000000000000000000000000000000000000000000000000_o1
 *
 * Jigs may be deleted in a transaction, ending in _d<vdel>
 *
 *    0000000000000000000000000000000000000000000000000000000000000000_d0
 *
 * Instance and code jigs both use this format. Berries are extensions of a code jig location to
 * include its berry path, state hash, and protocol version, because this information will not
 * be present in any transaction:
 *
 *    0000000000000000000000000000000000000000000000000000000000000000_o1?\
 *        berry=1111111111111111111111111111111111111111111111111111111111111111&\
 *        hash=2222222222222222222222222222222222222222222222222222222222222222&\
 *        version=5
 *
 * The query parameters are sorted alphabetically, and berry paths are URI-component encoded.
 * The hash may not be present before the berry is created.
 *
 * native:// is for locations of built-in Run types. They ship with Run and are not on the
 * blockchain. They include Jig and Berry.
 *
 *    native://Jig
 *
 * These are the only valid user-facing locations. However, Run internally has other kinds of
 * locations. In state locations may not always have a txid to refer to the current transaction:
 *
 *    _o1 or _d1
 *
 * Run also has other "special" locations that are prefixed with a protocol. These look vaguely
 * like URIs, and the supported prefixes are record:// and error://.
 *
 * record:// is also used while recording and after its commit
 *
 *    record://0000000000000000000000000000000000000000000000000000000000000000_o2
 *
 * error:// is for locations that are no longer valid. It may contain an error string afterwards
 * that does not have to follow the normal character rules.
 *
 *    error://Something bad happened
 *
 * A special error://Undeployed is used to indicate that a jig is intentionally not yet deployed.
 *
 * @param {string} s Location string
 * @returns {_txid, _vout, _vdel, _berry, _hash, _version, _error, _record, _native, _undeployed, _partial }
 */
function _location (s) {
  if (typeof s !== 'string') throw new Error(`Location is not a string: ${_text(s)}`)

  const match =
    s.match(JIG_LOCATION) ||
    s.match(BERRY_LOCATION) ||
    s.match(RECORD_LOCATION) ||
    s.match(ERROR_LOCATION) ||
    s.match(NATIVE_LOCATION)

  if (match) {
    const ret = {}
    const groups = match.groups

    if (groups.protocol === 'record') { ret._record = groups.record }
    if (groups.protocol === 'error') { ret._error = groups.error }
    if (groups.protocol === 'native') { ret._native = groups.native }

    if (_defined(groups.txid)) { ret._txid = groups.txid }
    if (_defined(groups.vout)) { ret._vout = parseInt(groups.vout) }
    if (_defined(groups.vdel)) { ret._vdel = parseInt(groups.vdel) }
    if (_defined(groups.berry)) { ret._berry = decodeURIComponent(groups.berry) }
    if (_defined(groups.hash)) { ret._hash = groups.hash }
    if (_defined(groups.version)) { ret._version = _version(parseInt(groups.version)) }

    if (s === _UNDEPLOYED_LOCATION) ret._undeployed = true

    return ret
  }

  throw new Error(`Bad location: ${_text(s)}`)
}

// ------------------------------------------------------------------------------------------------
// _compileLocation
// ------------------------------------------------------------------------------------------------

/**
 * The opposite of _location(). Puts together a location string from its parts.
 *
 * When parts conflict, behavior is undefined.
 *
 * @param {_txid, _vout, _vdel, _berry, _hash, _version, _error, _record, _native} parts
 * @returns {string} Location string
 */
function _compileLocation (parts) {
  _assert(typeof parts === 'object' && parts)

  // Errors
  if (_defined(parts._error)) return `error://${parts._error}`

  // Native
  if (_defined(parts._native)) return `native://${parts._native}`

  // Prefix
  let prefix = ''
  if (_defined(parts._record)) prefix = `record://${parts._record}`
  if (_defined(parts._txid)) prefix = parts._txid

  // Suffix
  let suffix = ''
  if (_defined(parts._vout)) suffix = `_o${parts._vout}`
  if (_defined(parts._vdel)) suffix = `_d${parts._vdel}`

  // Query params
  const params = []
  if (_defined(parts._berry)) {
    params.push(`berry=${encodeURIComponent(parts._berry)}`)
    if (_defined(parts._hash)) params.push(`hash=${parts._hash}`)
    if (_defined(parts._version)) params.push(`version=${parts._version}`)
  }
  const query = params.length ? `?${params.join('&')}` : ''

  // Combine location
  return `${prefix}${suffix}${query}`
}

// ------------------------------------------------------------------------------------------------
// _nonce
// ------------------------------------------------------------------------------------------------

// The number of transactions that the jig has been updated in
function _nonce (nonce) {
  if (Number.isInteger(nonce) && nonce >= 1) return nonce
  throw new Error(`Invalid nonce: ${_text(nonce)}`)
}

// ------------------------------------------------------------------------------------------------
// _owner
// ------------------------------------------------------------------------------------------------

/**
 * Returns the Lock for this creation owner or null, or throws an error
 *
 * If owner is null, then the creation does not have an output (deleted, or berry).
 */
function _owner (owner, allowNull = false, bsvNetwork = undefined) {
  const CommonLock = require('./common-lock')

  if (typeof owner === 'string') {
    // Try parsing it as a public key
    try {
      // Public key owners are converted into address scripts because
      // the public APIs more frequently support P2PKH UTXO queries and
      // we want as much compatibility as posible for the common use case.
      // Public key owners enable encryption that isn't possible with
      // address owners, no matter how the UTXO is represented.
      const pubkey = new bsv.PublicKey(owner, { network: bsvNetwork })
      const testnet = bsvNetwork ? bsvNetwork === 'testnet' : undefined
      return new CommonLock(pubkey.toAddress().toString(), testnet)
    } catch (e) { }

    // Try parsing it as an address
    try {
      // The base58 check does a sha256d, which is quite slow. This is a user feature. We will
      // expect owners have correct base58 checksums and not enforce it in the protocol.
      const testnet = bsvNetwork ? bsvNetwork === 'testnet' : bsvNetwork === 'mainnet' ? false : undefined
      const commonLock = new CommonLock(owner, testnet)
      commonLock.script() // Check that address is formatted correctly and for the network
      return commonLock
    } catch (e) { }
  }

  // Check if it is a custom owner
  const { Lock } = require('./api')
  if (owner instanceof Lock) {
    return owner
  }

  // Null may be used if the jig is deleted and we are reading its owner
  if (owner === null && allowNull) return null

  throw new Error(`Invalid owner: ${_text(owner)}`)
}

// ------------------------------------------------------------------------------------------------
// _satoshis
// ------------------------------------------------------------------------------------------------

/**
 * Checks that the satoshis property of a creation is a non-negative number within a certain range
 */
function _satoshis (satoshis, allowMaxInt) {
  if (typeof satoshis !== 'number') throw new Error('satoshis must be a number')
  if (!Number.isInteger(satoshis)) throw new Error('satoshis must be an integer')
  if (satoshis < 0) throw new Error('satoshis must be non-negative')
  let kernel = null
  try {
    kernel = _activeKernel()
  } catch (e) { /* swallow for now, until we have a Run global */ }
  const limit = allowMaxInt ? Number.MAX_SAFE_INTEGER : (kernel ? kernel._backingLimit : MAX_SATOSHIS)
  if (satoshis > limit) throw new Error(`satoshis must be <= ${limit}`)
  return satoshis
}

// ------------------------------------------------------------------------------------------------
// _markUndeployed
// ------------------------------------------------------------------------------------------------

function _markUndeployed (jig) {
  _sudo(() => {
    _setOwnProperty(jig, 'location', _UNDEPLOYED_LOCATION)
    _setOwnProperty(jig, 'origin', _UNDEPLOYED_LOCATION)
    _setOwnProperty(jig, 'nonce', _UNDEPLOYED_NONCE)
    _setOwnProperty(jig, 'owner', _UNDEPLOYED_OWNER)
    _setOwnProperty(jig, 'satoshis', _UNDEPLOYED_SATOSHIS)
  })
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _location,
  _compileLocation,
  _nonce,
  _owner,
  _satoshis,
  _markUndeployed,
  _LOCATION_BINDINGS,
  _UTXO_BINDINGS,
  _BINDINGS,
  _UNDEPLOYED_LOCATION,
  _UNDEPLOYED_NONCE
}
