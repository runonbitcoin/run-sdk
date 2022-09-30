/**
 * deep.js
 *
 * Deep object inspection and processing
 */

const {
  _basicArray, _basicObject, _text, _basicSet, _basicMap, _basicUint8Array,
  _arbitraryObject, _setOwnProperty, _assert
} = require('./misc')
const { _deterministicObjectKeys } = require('./determinism')
const CreationSet = require('./creation-set')
const Sandbox = require('./sandbox')
const HI = Sandbox._hostIntrinsics
const SI = Sandbox._intrinsics
const HIS = Sandbox._hostIntrinsicSet
const SIS = Sandbox._intrinsicSet
const HO = HI.Object
const SO = SI.Object

// ------------------------------------------------------------------------------------------------
// _deepVisit
// ------------------------------------------------------------------------------------------------

/**
 * Deeply traverses an object, calling the callback for every internal object and function,
 * including the object itself.
 *
 * This will traverse not just an object's properties, but also the class it belongs to, and
 * internal properties on sets and maps. It will not however traverse class prototype objects.
 * Properties will be traversed in a deterministic order.
 *
 * Callbacks should return true or false for whether to dive down deeper.
 *
 * @param {*} x Object to traverse
 * @param {function} callback Callback for each object
 */
function _deepVisit (x, callback, visited = new Set()) {
  if ((typeof x !== 'function' && typeof x !== 'object') || !x) {
    callback(x)
    return
  }

  if (visited.has(x)) return
  visited.add(x)

  if (callback(x) === false) return

  // Traverse set entries
  if (x instanceof HI.Set || x instanceof SI.Set) {
    for (const y of x) {
      _deepVisit(y, callback, visited)
    }
  }

  // Traverse map keys and values
  if (x instanceof HI.Map || x instanceof SI.Map) {
    for (const [key, value] of x) {
      _deepVisit(key, callback, visited)
      _deepVisit(value, callback, visited)
    }
  }

  // Traverse standard properties
  _deterministicObjectKeys(x).forEach(key => {
    _deepVisit(x[key], callback, visited)
  })

  // Traverse the constructor
  if (typeof x === 'object' && !HIS.has(x.constructor) && !SIS.has(x.constructor)) {
    _deepVisit(x.constructor, callback, visited)
  }

  // Traverse the parent
  const X = Object.getPrototypeOf(x)
  if (typeof x === 'function' && X !== HO.getPrototypeOf(HO) && X !== SO.getPrototypeOf(SO)) {
    _deepVisit(X, callback, visited)
  }
}

// ------------------------------------------------------------------------------------------------
// _deepReplace
// ------------------------------------------------------------------------------------------------

/**
 * Deeply traverses an object, replacing objects and functions in-place with new objects and
 * functions before traversing deeper. Replaced objects are also traversed. Properties are
 * traversed in a deterministic order.
 *
 * The replacer is passed an object and returns a new object.
 *
 * @param {*} x Object to traverse
 * @param {function} replacer Callback to replace each object
 * @returns {*} Replaced object
 */
function _deepReplace (x, replacer, visited = new Map()) {
  if ((typeof x !== 'function' && typeof x !== 'object') || !x) return x

  if (visited.has(x)) return visited.get(x)

  let recurse = true
  const setRecurse = r => { recurse = r }
  const x2 = replacer(x, setRecurse) || x
  visited.set(x, x2)

  if ((typeof x2 !== 'function' && typeof x2 !== 'object') || !x2 || !recurse) return x2

  const Sandbox = require('./sandbox')
  const Code = require('./code')
  const HI = Sandbox._hostIntrinsics
  const SI = Sandbox._intrinsics
  const HIS = Sandbox._hostIntrinsicSet
  const SIS = Sandbox._intrinsicSet
  const HO = HI.Object
  const SO = SI.Object

  // Traverse set entries
  if (x2 instanceof HI.Set || x2 instanceof SI.Set) {
    const entries = Array.from(x2)
    for (let i = 0; i < entries.length; i++) {
      entries[i] = _deepReplace(entries[i], replacer, visited)
    }
    x2.clear()
    entries.forEach(y => x2.add(y))
  }

  // Traverse map entries
  if (x2 instanceof HI.Map || (x2 instanceof SI.Map)) {
    const entries = Array.from(x2)
    for (let i = 0; i < entries.length; i++) {
      entries[i][0] = _deepReplace(entries[i][0], replacer, visited)
      entries[i][1] = _deepReplace(entries[i][1], replacer, visited)
    }
    x2.clear()
    entries.forEach(entry => x2.set(entry[0], entry[1]))
  }

  // Traverse standard properties
  _deterministicObjectKeys(x2).forEach(key => {
    const y = x2[key]
    const y2 = _deepReplace(y, replacer, visited)
    if (y !== y2) _setOwnProperty(x2, key, y2)
  })

  // Traverse the constructor
  if (typeof x2 === 'object' && !HIS.has(x2.constructor) && !SIS.has(x2.constructor)) {
    const X = _deepReplace(x2.constructor, replacer, visited)
    if (Object.getPrototypeOf(x2) !== X.prototype) Object.setPrototypeOf(x2, X.prototype)
  }

  // Traverse the parent
  const X = Object.getPrototypeOf(x2)
  if (typeof x2 === 'function' && X !== HO.getPrototypeOf(HO) && X !== SO.getPrototypeOf(SO)) {
    // Replace the parent class
    const Y = _deepReplace(X, replacer, visited)
    if (X !== Y) {
      _assert(x2 !== Y)
      Object.setPrototypeOf(x2, Y)

      // Code jigs have two prototypes for every class
      const x2proto = x2 instanceof Code ? Object.getPrototypeOf(x2.prototype) : x2.prototype
      Object.setPrototypeOf(x2proto, Y.prototype)
    }
  }

  return x2
}

// ------------------------------------------------------------------------------------------------
// _deepClone
// ------------------------------------------------------------------------------------------------

/**
 * Deeply clones an object, replacing all internal objects with new clones.
 *
 * Creations are not cloned but passed through. This is because they are designed to cross
 * sandbox boundaries and also because they are unique objects.
 *
 * The datatypes that are cloneable are the same as those that are serializable. They are:
 *
 *    - Primitive types (number, string, boolean, null)
 *    - Basic objects
 *    - Basic arrays
 *    - Sets
 *    - Maps
 *    - Uint8Array
 *    - Arbitrary objects
 *    - Creations: Jig, Code, Berry
 *
 * Key order is not preserved. The keys are deterministically traversed and sorted.
 *
 * @param {object|function} x Object to clone
 * @param {?object} intrinsics Output intrinsics. Defaults to host intrinsics.
 * @param {function} replacer Optional replace function to use for objects instead of clone
 * @returns {object|function} Cloned version of x
 */
function _deepClone (x, intrinsics, replacer, visited = new Map()) {
  if (typeof x === 'symbol') throw new Error(`Cannot clone: ${_text(x)}`)
  if ((typeof x !== 'function' && typeof x !== 'object') || !x) return x

  if (visited.has(x)) return visited.get(x)

  if (replacer) {
    const y = replacer(x)
    if (y) {
      visited.set(x, y)
      return y
    }
  }

  const Sandbox = require('./sandbox')
  const Creation = require('./creation')

  const HI = Sandbox._hostIntrinsics
  const HIS = Sandbox._hostIntrinsicSet
  const SIS = Sandbox._intrinsicSet

  intrinsics = intrinsics || HI

  if (x instanceof Creation) return x

  if (typeof x === 'function') {
    throw new Error(`Cannot clone non-code function: ${_text(x)}`)
  }

  if (HIS.has(x) || SIS.has(x)) {
    throw new Error(`Cannot clone intrinsic: ${_text(x)}`)
  }

  let y = null

  if (_basicArray(x)) {
    y = new intrinsics.Array()
  }

  if (_basicObject(x)) {
    y = new intrinsics.Object()
  }

  if (_basicUint8Array(x)) {
    return new intrinsics.Uint8Array(intrinsics.Array.from(x))
  }

  if (_basicSet(x)) {
    y = new intrinsics.Set()
  }

  if (_basicMap(x)) {
    y = new intrinsics.Map()
  }

  // Fall through case. We will act as if it's an arbitrary object until the end.
  let arbitraryObject = false
  if (!y) {
    arbitraryObject = true
    y = new intrinsics.Object()
  }

  if (!y) throw new Error(`Cannot clone: ${_text(x)}`)

  visited.set(x, y)

  // Clone set entries
  if (y instanceof intrinsics.Set) {
    for (const entry of x) {
      const clonedEntry = _deepClone(entry, intrinsics, replacer, visited)
      y.add(clonedEntry)
    }
  }

  // Clone map entries
  if (y instanceof intrinsics.Map) {
    for (const entry of x) {
      const key = _deepClone(entry[0], intrinsics, replacer, visited)
      const value = _deepClone(entry[1], intrinsics, replacer, visited)
      y.set(key, value)
    }
  }

  // Clone standard properties
  _deterministicObjectKeys(x).forEach(key => {
    if (typeof key === 'symbol') throw new Error(`Cannot clone: ${_text(key)}`)
    _setOwnProperty(y, key, _deepClone(x[key], intrinsics, replacer, visited))
  })

  // Clone the arbitrary object's class
  if (!HIS.has(x.constructor) && !SIS.has(x.constructor)) {
    const Y = _deepClone(x.constructor, intrinsics, replacer, visited)
    Object.setPrototypeOf(y, Y.prototype)
  }

  if (arbitraryObject && !_arbitraryObject(y)) throw new Error(`Cannot clone: ${_text(x)}`)

  return y
}

// ------------------------------------------------------------------------------------------------
// _deepEqual
// ------------------------------------------------------------------------------------------------

/**
 * Deeply compares whether two objects are equal, meaning all subproperties have the same value.
 * The two objects need not be the same. Key order is checked as being insertion order.
 */
function _deepEqual (a, b, options = {}) {
  if (typeof a !== typeof b) return false
  if (typeof a === 'number' && isNaN(a) && isNaN(b)) return true

  const Creation = require('./creation')
  if (a instanceof Creation) {
    return CreationSet._sameCreation(a, b)
  }

  if (typeof a !== 'object' || !a || !b) return a === b

  // Get object keys via getOwnPropertyNames which is insertion ordered + filter non-enumerables!
  const aOwnKeys = Object.getOwnPropertyNames(a)
  const bOwnKeys = Object.getOwnPropertyNames(b)
  const aDescs = Object.getOwnPropertyDescriptors(a)
  const bDescs = Object.getOwnPropertyDescriptors(b)
  const aKeys = aOwnKeys.filter(key => aDescs[key].enumerable)
  const bKeys = bOwnKeys.filter(key => bDescs[key].enumerable)

  if (aKeys.length !== bKeys.length) return false
  if (options._ordering) {
    for (let i = 0; i < aKeys.length; i++) {
      const aKey = aKeys[i]
      const bKey = bKeys[i]
      if (aKey !== bKey) return false
      if (!_deepEqual(a[aKey], b[bKey])) return false
    }
  } else {
    if (aKeys.some(key => !bKeys.includes(key))) return false
    if (aKeys.some(key => !_deepEqual(a[key], b[key], options))) return false
  }

  if (_basicObject(a)) {
    if (!_basicObject(b)) return false
    return true
  }

  if (_basicArray(a)) {
    if (!_basicArray(b)) return false
    return true
  }

  if (_basicSet(a)) {
    if (!_basicSet(b)) return false
    if (a.size !== b.size) return false
    if (!_deepEqual(Array.from(a.entries()), Array.from(b.entries()))) return false
    return true
  }

  if (_basicMap(a)) {
    if (!_basicMap(b)) return false
    if (a.size !== b.size) return false
    if (!_deepEqual(Array.from(a.entries()), Array.from(b.entries()))) return false
    return true
  }

  if (_basicUint8Array(a)) {
    if (!_basicUint8Array(b)) return false
    return true
  }

  throw new Error(`Unsupported: ${a}`)
}

// ------------------------------------------------------------------------------------------------

module.exports = { _deepVisit, _deepReplace, _deepClone, _deepEqual }
