/**
 * misc.js
 *
 * Various helper methods
 */

const { InternalError, TimeoutError } = require('./error')
const { _sudo } = require('./admin')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

// Creations are only creations if they are in these weak sets.
// This gives us control over what is and isn't a creation.
const _JIGS = new WeakSet()
const _CODE = new WeakSet() // Jig code and sidekick code
const _BERRIES = new WeakSet()

// ------------------------------------------------------------------------------------------------
// _RESERVED
// ------------------------------------------------------------------------------------------------

// Some methods like auth and destroy are safe to call inside other methods. Therefore, they
// are not reserved. Other methods are not safe in this way. Below are reserved words.

// Not sure exactly how these will be used yet, so setting aside for later
const _RESERVED_PROPS = [
  // Future bindings
  'encryption',
  'blockhash',
  'blocktime',
  'blockheight',

  // Time methods
  'latest',
  'recent',
  'mustBeLatest',
  'mustBeRecent',
  'checkForUpdates',

  // Control methods
  'recover',
  'replicate',
  'makeBackup',
  'restricts',
  'delegate',
  'consume',
  'eject',
  'armored',
  'armoured'
]

const _RESERVED_CODE_PROPS = [
  'toString', // interfers with source code generation
  'upgrade', // upgrade is only supported as a top-level action right now
  'sync', // sync only works externally and as a top-level command
  'destroy', // eventually destroy should not be reserved
  'auth', // eventually auth should not be reserved
  'load', // load is used on jigs and berries and not currently supported on sidekick code
  'init' // Will be used for static initializers in the future
]

const _RESERVED_JIG_PROPS = [
  'sync', // sync only works externally and as a top-level command
  'interactive'
]

// Currently there are no reserved berry instance methods
const _RESERVED_BERRY_PROPS = [
  'interactive'
]

// Final properties are properties which cannot be set/deleted/changed in any way
const _FINAL_CODE_PROPS = [..._RESERVED_CODE_PROPS, 'deps']
const _FINAL_JIG_PROPS = [..._RESERVED_JIG_PROPS, 'init'] // destroy and auth are not protected
const _FINAL_BERRY_PROPS = [..._RESERVED_BERRY_PROPS, 'init']

// ------------------------------------------------------------------------------------------------
// _kernel
// ------------------------------------------------------------------------------------------------

/**
 * Returns the active kernel
 */
function _activeKernel () {
  const Kernel = require('./kernel')
  if (!Kernel._instance) throw new Error('Run instance not active')
  return Kernel._instance
}

// ------------------------------------------------------------------------------------------------
// _assert
// ------------------------------------------------------------------------------------------------

/**
 * Internal assertion that is expected to be true.
 */
function _assert (condition, msg) {
  if (!condition) throw new InternalError(msg || 'assert failed')
}

// ------------------------------------------------------------------------------------------------
// _bsvNetwork
// ------------------------------------------------------------------------------------------------

/**
 * Gets a bsv library network string from a Run network string
 *
 * All networks that start with 'main' are considered mainnet. Everything else is testnet. This
 * lets us have potentially many "testnet" networks - ie. stn, mock, dev - that are clearly
 * distinct from mainnets. There might be multiple "mainnet" networks too if we have a hybrid
 * on-chain and off-chain system such as Overpool, which could be, for example, 'main-overpool'.
 * @param {string} network Run network string
 */
function _bsvNetwork (network) {
  return network.startsWith('main') ? 'mainnet' : 'testnet'
}

// ------------------------------------------------------------------------------------------------
// _parent
// ------------------------------------------------------------------------------------------------

/**
 * Gets the parent class of T, or undefined if none exists
 */
function _parent (T) {
  if (typeof T !== 'function') return
  const Sandbox = require('./sandbox')
  const Code = require('./code')
  const SO = Sandbox._intrinsics.Object
  const HO = Sandbox._hostIntrinsics.Object
  const P = Object.getPrototypeOf(T)
  const hasParent = P !== HO.getPrototypeOf(HO) && P !== SO.getPrototypeOf(SO) &&
    P !== Code.prototype
  if (hasParent) return P
}

// ------------------------------------------------------------------------------------------------
// _parentName
// ------------------------------------------------------------------------------------------------

/**
 * Gets the parent class name out of the source code, or null if there is no parent
 */
function _parentName (src) {
  const parentRegex = /^\s*class\s+[a-zA-Z0-9_$]+\s+extends\s+([a-zA-Z0-9_$]+)\s*{/
  const parentMatch = src.match(parentRegex)
  return parentMatch && parentMatch[1]
}

// ------------------------------------------------------------------------------------------------
// _extendsFrom
// ------------------------------------------------------------------------------------------------

/**
 * Returns whether A extends from B somewhere in its class chain
 */
function _extendsFrom (A, B) {
  while (A) {
    A = Object.getPrototypeOf(A)
    if (A === B) return true
  }
  return false
}

// ------------------------------------------------------------------------------------------------
// _text
// ------------------------------------------------------------------------------------------------

/*
 * Converts any value into a short string form usable in error messages and logs.
 * @param {*} x Value to stringify
 */
function _text (x) {
  return _sudo(() => {
    switch (typeof x) {
      case 'string': return `"${x.length > 20 ? x.slice(0, 20) + '…' : x}"`

      case 'object': {
        if (!x) return 'null'
        if (!x.constructor.name) return '[anonymous object]'
        const Jig = require('./jig')
        const Berry = require('./berry')
        const kind = x instanceof Jig ? 'jig' : x instanceof Berry ? 'berry' : 'object'
        return `[${kind} ${x.constructor.name}]`
      }

      case 'function': {
        let src = null
        const Code = require('./code')
        if (x instanceof Code) {
          src = Code.prototype.toString.apply(x)
        } else {
          const safeToString = typeof x.toString === 'function' && !x.toString.toString().startsWith('class')
          src = safeToString ? x.toString() : Function.prototype.toString.apply(x)
        }

        const isAnonymousFunction =
          /^\(/.test(src) || // () => {}
          /^function\s*\(/.test(src) || // function() {}
          /^[a-zA-Z0-9_$]+\s*=>/.test(src) // x => x

        if (isAnonymousFunction) return '[anonymous function]'
        const isAnonymousClass = /^class\s*{/.test(src)
        if (isAnonymousClass) return '[anonymous class]'

        return x.name
      }

      case 'undefined': return 'undefined'

      default: return x.toString()
    }
  })
}

// ------------------------------------------------------------------------------------------------
// Type detection
// ------------------------------------------------------------------------------------------------

function _basicObject (x) {
  return typeof x === 'object' && !!x && _protoLen(x) === 2
}

// ------------------------------------------------------------------------------------------------

function _basicArray (x) {
  return Array.isArray(x) && _protoLen(x) === 3
}

// ------------------------------------------------------------------------------------------------

function _basicSet (x) {
  const Sandbox = require('./sandbox')
  const SI = Sandbox._intrinsics
  const HI = Sandbox._hostIntrinsics
  return (x instanceof HI.Set || x instanceof SI.Set) && _protoLen(x) === 3
}

// ------------------------------------------------------------------------------------------------

function _basicMap (x) {
  const Sandbox = require('./sandbox')
  const SI = Sandbox._intrinsics
  const HI = Sandbox._hostIntrinsics
  return (x instanceof HI.Map || x instanceof SI.Map) && _protoLen(x) === 3
}

// ------------------------------------------------------------------------------------------------

function _basicUint8Array (x) {
  const Sandbox = require('./sandbox')
  const SI = Sandbox._intrinsics
  const HI = Sandbox._hostIntrinsics
  return (x instanceof HI.Uint8Array || x instanceof SI.Uint8Array) && _protoLen(x) === 4
}

// ------------------------------------------------------------------------------------------------

function _arbitraryObject (x) {
  if (typeof x !== 'object' || !x) return false
  const Code = require('./code')
  if (!(x.constructor instanceof Code)) return false
  const Jig = require('./jig')
  if (x instanceof Jig) return false
  const Berry = require('./berry')
  if (x instanceof Berry) return false
  return true
}

// ------------------------------------------------------------------------------------------------

function _defined (x) {
  return typeof x !== 'undefined'
}

// ------------------------------------------------------------------------------------------------

function _negativeZero (x) {
  // Object.is(x, -0) is not reliable on Firefox
  return x === 0 && 1 / x === -Infinity
}

// ------------------------------------------------------------------------------------------------

function _intrinsic (x) {
  const Sandbox = require('./sandbox')
  if (Sandbox._hostIntrinsicSet.has(x)) return true
  if (Sandbox._intrinsicSet.has(x)) return true
  return false
}

// ------------------------------------------------------------------------------------------------

function _serializable (x) {
  const { _deepVisit } = require('./deep')
  let serializable = true
  try {
    _sudo(() => _deepVisit(x, x => { serializable = serializable && _serializableValue(x) }))
  } catch (e) { }
  return serializable
}

// ------------------------------------------------------------------------------------------------

function _serializableValue (x) {
  if (typeof x === 'undefined') return true
  if (typeof x === 'boolean') return true
  if (typeof x === 'number') return true
  if (typeof x === 'string') return true
  if (x === null) return true
  if (_intrinsic(x)) return false
  if (_basicObject(x)) return true
  if (_basicArray(x)) return true
  if (_basicSet(x)) return true
  if (_basicMap(x)) return true
  if (_basicUint8Array(x)) return true
  if (_arbitraryObject(x)) return true
  const Creation = require('./creation')
  if (x instanceof Creation) return true
  return false // Symbols, intrinsic, non-code functions, and extended intrinsics
}

// ------------------------------------------------------------------------------------------------

const ANON_CLASS_REGEX = /^class\s*{/
const ANON_CLASS_EXTENDS_REGEX = /^class\s+(extends)?\s+\S+\s*{/
const ANON_FUNCTION_REGEX = /^function\s*\(/

function _anonymous (x) {
  if (typeof x !== 'function') return false
  if (!x.name) return true
  const s = x.toString()
  if (!s.startsWith('class') && !s.startsWith('function')) return true
  return ANON_CLASS_REGEX.test(s) || ANON_CLASS_EXTENDS_REGEX.test(s) || ANON_FUNCTION_REGEX.test(s)
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets the length of the prototype chain
 */
function _protoLen (x) {
  if (!x) return 0
  let n = 0
  do {
    n++
    x = Object.getPrototypeOf(x)
  } while (x)
  return n
}

// ------------------------------------------------------------------------------------------------
// _getOwnProperty
// ------------------------------------------------------------------------------------------------

function _getOwnProperty (x, name) {
  if (!x || (typeof x !== 'function' && typeof x !== 'object')) return undefined
  const desc = Object.getOwnPropertyDescriptor(x, name)
  return desc && desc.value
}

// ------------------------------------------------------------------------------------------------
// _hasOwnProperty
// ------------------------------------------------------------------------------------------------

function _hasOwnProperty (x, name) {
  if (!x || (typeof x !== 'function' && typeof x !== 'object')) return false
  if (typeof name === 'string') return Object.getOwnPropertyNames(x).includes(name)
  if (typeof name === 'symbol') return Object.getOwnPropertySymbols(x).includes(name)
}

// ------------------------------------------------------------------------------------------------
// _setOwnProperty
// ------------------------------------------------------------------------------------------------

function _setOwnProperty (x, name, value) {
  let desc = Object.getOwnPropertyDescriptor(x, name)
  if (!desc || desc.get || desc.set) desc = { configurable: true, enumerable: true, writable: true }
  desc.value = value
  const { _deterministicDefineProperty } = require('./determinism')
  _deterministicDefineProperty(x, name, desc)
}

// ------------------------------------------------------------------------------------------------
// _defineGetter
// ------------------------------------------------------------------------------------------------

function _defineGetter (target, name, getter) {
  Object.defineProperty(target, name, {
    get: getter,
    configurable: true,
    enumerable: true
  })
}

// ------------------------------------------------------------------------------------------------
// _ownGetters
// ------------------------------------------------------------------------------------------------

function _ownGetters (x) {
  return Object.getOwnPropertyNames(x)
    .concat(Object.getOwnPropertySymbols(x))
    .filter(prop => Object.getOwnPropertyDescriptor(x, prop).get)
}

// ------------------------------------------------------------------------------------------------
// _ownMethods
// ------------------------------------------------------------------------------------------------

function _ownMethods (x) {
  return Object.getOwnPropertyNames(x)
    .concat(Object.getOwnPropertySymbols(x))
    .filter(prop => prop !== 'constructor')
    .filter(prop => typeof Object.getOwnPropertyDescriptor(x, prop).value === 'function')
}

// ------------------------------------------------------------------------------------------------
// _limit
// ------------------------------------------------------------------------------------------------

function _limit (limit, name = 'limit') {
  if (limit === null) return Number.MAX_VALUE
  if (limit === -1) return Number.MAX_VALUE
  if (limit === Infinity) return Number.MAX_VALUE
  if (typeof limit !== 'number' || limit < 0) throw new Error(`Invalid ${name}: ${_text(limit)}`)
  return limit
}

// -------------------------------------------------------------------------------------------------
// _Timeout
// ------------------------------------------------------------------------------------------------

// A object that can track an operation's duration across multiple methods.
// _check() should be called periodically after every long-running or async operation.
class _Timeout {
  constructor (method, timeout, data) {
    this._start = new Date()
    this._method = method
    this._timeout = timeout
    this._data = data
  }

  _check () {
    if (new Date() - this._start > _limit(this._timeout, 'timeout')) {
      const data = this._data ? ` (${this._data})` : ''
      throw new TimeoutError(`${this._method} timeout${data})`)
    }
  }
}

// ------------------------------------------------------------------------------------------------
// _filterInPlace
// ------------------------------------------------------------------------------------------------

function _filterInPlace (arr, f) {
  let len = 0
  arr.forEach((x, n) => { if (f(x, n, arr)) arr[len++] = x })
  arr.length = len
  return arr
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _JIGS,
  _CODE,
  _BERRIES,
  _RESERVED_PROPS,
  _RESERVED_CODE_PROPS,
  _RESERVED_JIG_PROPS,
  _RESERVED_BERRY_PROPS,
  _FINAL_CODE_PROPS,
  _FINAL_JIG_PROPS,
  _FINAL_BERRY_PROPS,
  _activeKernel,
  _assert,
  _bsvNetwork,
  _parent,
  _parentName,
  _extendsFrom,
  _text,
  _basicObject,
  _basicArray,
  _basicSet,
  _basicMap,
  _basicUint8Array,
  _arbitraryObject,
  _defined,
  _negativeZero,
  _intrinsic,
  _serializable,
  _serializableValue,
  _anonymous,
  _protoLen,
  _getOwnProperty,
  _hasOwnProperty,
  _setOwnProperty,
  _defineGetter,
  _ownGetters,
  _ownMethods,
  _limit,
  _Timeout,
  _filterInPlace
}
