/**
 * determinism.js
 *
 * Code to make the sandbox deterministic or detect non-determinism
 */

const { _basicUint8Array } = require('./misc')

// ------------------------------------------------------------------------------------------------
// _makeDeterministic
// ------------------------------------------------------------------------------------------------

/**
 * Stubs JavaScript implementations to make the current realm deterministic.
 *
 * This builds expects SES's lockdown() function to be called and does not duplicate that work.
 * For example, lockdown() already shuts down the Date object. We also expect that
 * the nonDeterministicIntrinsics below will be disabled by the realm.
 *
 * This all has to be in one function because its code will be executed in the realm.
 */
function _makeDeterministic (stableJSONStringify) {
  const defaultCompare = (x, y) => {
    if (x === y) return 0
    if (x === undefined) return 1
    if (y === undefined) return -1
    const xs = x === null ? 'null' : x.toString()
    const ys = y === null ? 'null' : y.toString()
    return xs < ys ? -1 : xs > ys ? 1 : 0
  }

  // Make Array.prototype.sort stable. The spec does not guarantee this.
  // All major browsers are now stable: https://github.com/tc39/ecma262/pull/1340
  // So is Node 11+: https://github.com/nodejs/node/issues/29446
  // However, Node 10, is not stable. We fix it everywhere just in case.
  const oldSort = Array.prototype.sort
  function sort (compareFunc = defaultCompare) {
    const indices = new Map()
    this.forEach((x, n) => indices.set(x, n))
    const newCompareFunc = (a, b) => {
      const result = compareFunc(a, b)
      if (result !== 0) return result
      return indices.get(a) - indices.get(b)
    }
    return oldSort.call(this, newCompareFunc)
  }
  Array.prototype.sort = sort // eslint-disable-line

  // Disallow localeCompare. We probably could allow it in some cases in the future, but it's safer
  // to just turn it off for now.
  delete String.prototype.localeCompare

  // Make Object.keys() and similar methods deterministic. To do this, we make them behave like
  // Object.getOwnPropertyNames except it won't include non-enumerable properties like that does.
  // This hopefully will not affect many VMs anymore. For more details, see [1] [2] [3]
  //
  // [1] https://github.com/tc39/proposal-for-in-order
  // [2] https://esdiscuss.org/topic/property-ordering-of-enumerate-getownpropertynames
  // [3] https://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order

  const oldObjectKeys = Object.keys
  Object.keys = function keys (target) {
    const keys = oldObjectKeys(target)
    const props = Object.getOwnPropertyNames(target)
    return keys.sort((a, b) => props.indexOf(a) - props.indexOf(b))
  }

  Object.values = function values (target) {
    return Object.keys(target).map(key => target[key])
  }

  Object.entries = function entries (target) {
    return Object.keys(target).map(key => [key, target[key]])
  }

  // Uint8array elements should all be configurable when returned.
  // See: 2020-10-17 https://webkit.googlesource.com/WebKit/+/master/Source/JavaScriptCore/ChangeLog
  // See: Description https://github.com/tc39/ecma262/pull/2164
  // Node.js and some browsers return non-configurable entries, even though they may be changed.
  const oldReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor
  Reflect.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor (o, p) {
    const desc = oldReflectGetOwnPropertyDescriptor(o, p)
    if (desc && typeof p === 'string' && o instanceof Uint8Array) desc.configurable = true
    return desc
  }

  // When Uint8Array elements are set, define property may fail on older JS VMs. So we use direct sets.
  const oldReflectDefineProperty = Reflect.defineProperty
  Reflect.defineProperty = Object.defineProperty = function defineProperty (o, p, desc) {
    if (desc && typeof p === 'string' && o instanceof Uint8Array && desc.writable && desc.enumerable && desc.configurable) {
      Reflect.set(o, p, desc.value)
      return o
    }
    return oldReflectDefineProperty(o, p, desc)
  }

  const nativeStringify = JSON.stringify
  JSON.stringify = (value, replacer, space) => stableJSONStringify(value, replacer, space, null, nativeStringify)

  // Function.prototype.toString() in general is not deterministic. Whitespace, line terminators,
  // and semicolons may be different, and in Safari, the browser also inserts "function" before
  // method.toString(), where as Node and other browsers do not. We cannot fix all aspects of
  // non-determinism, but we can fix the "function" issue. We will not change the whitespace,
  // because whitespace may be important to the execution of the code. Without an interpreter
  // we cannot know.
  const oldFunctionToString = Function.prototype.toString
  function toString () { // eslint-disable-line
    // Hide our custom implementations
    if (this === Array.prototype.sort) return 'function sort() { [native code ] }'
    if (this === Object.keys) return 'function keys() { [native code ] }'
    if (this === Object.values) return 'function values() { [native code ] }'
    if (this === Object.entries) return 'function entries() { [native code ] }'
    if (this === JSON.stringify) return 'function stringify() { [native code ] }'
    if (this === toString) return 'function toString() { [native code ] }'
    if (this === Object.getOwnPropertyDescriptor) return 'function getOwnPropertyDescriptor() { [native code ] }'
    if (this === Reflect.getOwnPropertyDescriptor) return 'function getOwnPropertyDescriptor() { [native code ] }'
    if (this === Object.defineProperty) return 'function defineProperty() { [native code ] }'
    if (this === Reflect.defineProperty) return 'function defineProperty() { [native code ] }'

    const s = oldFunctionToString.call(this)
    const match = s.match(/^([a-zA-Z0-9_$]+)\s*\(/)
    return (match && match[1] !== 'function') ? `function ${s}` : s
  }
  Function.prototype.toString = toString // eslint-disable-line
}

// ------------------------------------------------------------------------------------------------
// Non-deterministic Intrinsics
// ------------------------------------------------------------------------------------------------

// Will be disabled
const _nonDeterministicIntrinsics = [
  'Date',
  'Math',
  'eval',
  'XMLHttpRequest',
  'FileReader',
  'WebSocket',
  'setTimeout',
  'setInterval'
]

// ------------------------------------------------------------------------------------------------
// _stableJSONStringify
// ------------------------------------------------------------------------------------------------

/*
 * A JSON.stringify implementation that stably sorts keys
 *
 * Based on https://github.com/substack/json-stable-stringify
 */
function _stableJSONStringify (value, replacer, space, cmp, nativeStringify) {
  if (typeof space === 'number') space = Array(space + 1).join(' ')
  if (typeof space !== 'string') space = ''

  const seen = new Set()

  function stringify (parent, key, node, level) {
    const indent = space ? ('\n' + new Array(level + 1).join(space)) : ''
    const colonSeparator = space ? ': ' : ':'

    if (node && typeof node.toJSON === 'function') node = node.toJSON()

    node = replacer ? replacer.call(parent, key, node) : node

    if (node === undefined) return undefined
    if (typeof node !== 'object' || node === null) return nativeStringify(node)

    if (seen.has(node)) throw new TypeError('Converting circular structure to JSON')
    seen.add(node)

    let result
    if (Array.isArray(node)) {
      const out = []
      for (let i = 0; i < node.length; i++) {
        const item = stringify(node, i, node[i], level + 1) || nativeStringify(null)
        out.push(indent + space + item)
      }
      result = '[' + out.join(',') + (out.length ? indent : '') + ']'
    } else {
      let keys = Object.keys(node)
      if (cmp) keys = keys.sort(cmp)
      const out = []
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const value = stringify(node, key, node[key], level + 1)
        if (!value) continue
        const keyValue = nativeStringify(key) + colonSeparator + value
        out.push(indent + space + keyValue)
      }
      result = '{' + out.join(',') + (out.length ? indent : '') + '}'
    }

    seen.delete(node)
    return result
  }

  // This matches the real JSON.stringify implementation
  return stringify({ '': value }, '', value, 0)
}

// ------------------------------------------------------------------------------------------------
// _deterministicJSONStringify
// ------------------------------------------------------------------------------------------------

// The JSON.stringify method uses Object.keys() to order its keys. Key order is non-deterministic
// in ES2015 using Object.keys() [1], so JSON.stringify is too. This is bad. We'ved tried various
// approaches to keep order intact, but ultimately it seemed simpler to just canonically order
// keys, in this case alphabetically.
//
// In 2020, key order is deterministic to spec on Node, Chrome, Firefox, and Edge. In Safari, it is
// mostly correct, but using proxies it still returns wrong values. Run uses proxies.
//
// [1] https://stackoverflow.com/questions/30076219/does-es6-introduce-a-well-defined-order-of-enumeration-for-object-properties

const _deterministicJSONStringify = (value, replacer, space) => {
  return _stableJSONStringify(value, replacer, space, _deterministicCompareKeys, JSON.stringify)
}

// ------------------------------------------------------------------------------------------------
// _deterministicObjectKeys
// ------------------------------------------------------------------------------------------------

// Object.keys() is not deterministic. Object.getOwnPropertyNames() is deterministic but returns
// non-enumerable properties. We create a safe version of Object.keys() that is deterministic.

function _deterministicObjectKeys (x) {
  return Object.keys(x).sort(_deterministicCompareKeys)
}

// ------------------------------------------------------------------------------------------------
// _deterministicCompareKeys
// ------------------------------------------------------------------------------------------------

function _deterministicCompareKeys (a, b) {
  if (typeof a !== typeof b) return typeof a === 'symbol' ? 1 : -1
  if (typeof a === 'symbol') a = a.toString()
  if (typeof b === 'symbol') b = b.toString()
  const aInt = parseInt(a)
  const bInt = parseInt(b)
  const aIsInteger = aInt.toString() === a
  const bIsInteger = bInt.toString() === b
  if (aIsInteger && !bIsInteger) return -1
  if (bIsInteger && !aIsInteger) return 1
  if (aIsInteger && bIsInteger) return aInt - bInt
  return a < b ? -1 : b < a ? 1 : 0
}

// ------------------------------------------------------------------------------------------------
// _deterministicDefineProperty
// ------------------------------------------------------------------------------------------------

function _deterministicDefineProperty (o, p, desc) {
  // When Uint8Array elements are set, define property may fail on older JS VMs that have configurable
  // to be false. But we can bypass this with direct sets, so we do.
  if (desc && typeof p === 'string' && _basicUint8Array(o) && desc.writable && desc.enumerable && desc.configurable) {
    Reflect.set(o, p, desc.value)
    return o
  }
  return Reflect.defineProperty(o, p, desc)
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _makeDeterministic,
  _nonDeterministicIntrinsics,
  _stableJSONStringify,
  _deterministicJSONStringify,
  _deterministicObjectKeys,
  _deterministicCompareKeys,
  _deterministicDefineProperty
}
