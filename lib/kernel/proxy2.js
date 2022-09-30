/**
 * proxy2.js
 *
 * A proxy that supports intrinsics supported by Run including:
 *
 *    Set
 *    Map
 *    Uint8Array
 *
 * These intrinsics have methods that modify their internal state that proxies don't naturally
 * handle. This is unlike Object and Array instances where every method, even complex ones
 * like sort(), calls proxy handlers. Proxy2 creates new traps for these new intrinsics.
 *
 * Proxy2 also allows the underlying target to be changed. This is an advanced operation. If
 * the underlying target changes, it is important that higher-level handlers are able to deal
 * with the proxy invariants, which affects "prototype":
 *
 *    https://www.ecma-international.org/ecma-262/8.0/#sec-proxy-object-internal-methods-and-internal-slots-get-p-receiver
 *
 * It is not necessary to use Proxy2 everywhere in Run. Proxy2 is used in jigs and inner jig objects.
 *
 * The following handler methods are supported in Proxy2:
 *
 *    Standard traps:           // With underscore prefix
 *
 *      _apply (target, thisArg, args)
 *      _construct (target, args, newTarget)
 *      _defineProperty (target, prop, desc)
 *      _deleteProperty (target, prop)
 *      _get (target, prop, receiver)
 *      _getOwnPropertyDescriptor (target, prop)
 *      _getPrototypeOf (target)
 *      _has (target, prop)
 *      _isExtensible (target)
 *      _ownKeys (target)
 *      _preventExtensions (target)
 *      _set (target, prop, value, receiver)
 *      _setPrototypeOf (target, prototype)
 *
 *    New traps:                // For Set, Map, and Uint8Array targets
 *
 *      _intrinsicGetMethod ()     // Access intrinsic method
 *      _intrinsicOut (value)      // ie. get(), forEach(): object -> object
 *      _intrinsicIn (value)       // ie. add(), set(): object -> object
 *      _intrinsicRead ()          // ie. has(), includes()
 *      _intrinsicUpdate ()        // ie. clear(), delete(), sort()
 */

const {
  _basicSet, _basicMap, _basicUint8Array, _ownGetters, _ownMethods, _assert
} = require('./misc')
const Sandbox = require('./sandbox')
const SI = Sandbox._intrinsics

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TARGETS = new WeakMap() // Proxy -> Target
const HANDLERS = new WeakMap() // Target | Proxy -> Handler
const ORIGINAL_HANDLERS = new WeakMap() // Proxy -> Original Handler

const INTRINSIC_METHODS = new WeakMap() // Target Method -> Proxy Method

const SET_GETTERS = _ownGetters(Set.prototype)
const MAP_GETTERS = _ownGetters(Map.prototype)
const UINT8ARRAY_GETTERS = _ownGetters(Uint8Array.prototype)
  .concat(_ownGetters(Object.getPrototypeOf(Uint8Array.prototype)))

const SET_METHODS = _ownMethods(Set.prototype)
const MAP_METHODS = _ownMethods(Map.prototype)
const UINT8ARRAY_METHODS = _ownMethods(Uint8Array.prototype)
  .concat(_ownMethods(Object.getPrototypeOf(Uint8Array.prototype)))

// JavaScript nicely splits method names across Set, Map, and Uint8Array into reads/updates
const UPDATE_METHODS = ['add', 'clear', 'copyWithin', 'delete', 'fill', 'reverse', 'set', 'sort']
const READ_METHODS = ['entries', 'every', 'filter', 'find', 'findIndex', 'forEach', 'get',
  'has', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf', 'map', 'reduce', 'reduceRight',
  'slice', 'some', 'subarray', 'toLocaleString', 'toString', 'values', Symbol.iterator]

// ------------------------------------------------------------------------------------------------
// Proxy2
// ------------------------------------------------------------------------------------------------

class Proxy2 {
  constructor (target, handler) {
    const proxy = new SI.Proxy(target, this)

    TARGETS.set(proxy, target)
    HANDLERS.set(target, handler)
    HANDLERS.set(proxy, handler)
    ORIGINAL_HANDLERS.set(proxy, this)

    this._handler = handler
    this._target = target

    // Determine the type of target
    this._isSet = _basicSet(target)
    this._isMap = _basicMap(target)
    this._isUint8Array = _basicUint8Array(target)

    return proxy
  }

  // Standard proxy handlers

  apply (target, thisArg, args) {
    if (!this._handler._apply) return Reflect.apply(this._target, thisArg, args)
    return this._handler._apply(this._target, thisArg, args)
  }

  construct (target, args, newTarget) {
    if (!this._handler._construct) return Reflect.construct(this._target, args, newTarget)
    return this._handler._construct(this._target, args, newTarget)
  }

  defineProperty (target, prop, desc) {
    if (!this._handler._defineProperty) return Reflect.defineProperty(this._target, prop, desc)
    return this._handler._defineProperty(this._target, prop, desc)
  }

  deleteProperty (target, prop) {
    if (!this._handler._deleteProperty) return Reflect.deleteProperty(this._target, prop)
    return this._handler._deleteProperty(this._target, prop)
  }

  getOwnPropertyDescriptor (target, prop) {
    if (!this._handler._getOwnPropertyDescriptor) return Reflect.getOwnPropertyDescriptor(this._target, prop)
    return this._handler._getOwnPropertyDescriptor(this._target, prop)
  }

  getPrototypeOf (target) {
    if (!this._handler._getPrototypeOf) return Reflect.getPrototypeOf(this._target)
    return this._handler._getPrototypeOf(this._target)
  }

  has (target, prop) {
    if (!this._handler._has) return Reflect.has(this._target, prop)
    return this._handler._has(this._target, prop)
  }

  isExtensible (target) {
    if (!this._handler._isExtensible) return Reflect.isExtensible(this._target)
    return this._handler._isExtensible(this._target)
  }

  ownKeys (target) {
    // Safari and Firefox don't like upgrading classes. They update the order of length
    // and name on the proxy, and only the proxy. We could move these properties back to their
    // original position to keep jigs deterministic, but instead we sort them in the membrane.
    if (!this._handler._ownKeys) return Reflect.ownKeys(this._target)
    return this._handler._ownKeys(this._target)
  }

  preventExtensions (target) {
    if (!this._handler._preventExtensions) return Reflect.preventExtensions(this._target)
    return this._handler._preventExtensions(this._target)
  }

  set (target, prop, value, receiver) {
    if (!this._handler._set) return Reflect.set(this._target, prop, value, receiver)
    return this._handler._set(this._target, prop, value, receiver)
  }

  setPrototypeOf (target, prototype) {
    if (!this._handler._setPrototypeOf) return Reflect.setPrototypeOf(this._target, prototype)
    return this._handler._setPrototypeOf(this._target, prototype)
  }

  // Modify get to handle all intrinsic methods using the special traps. Getters and methods are
  // not owned properties, so we don't need to handle getOwnPropertyDescriptor.
  get (target, prop, receiver) {
    // Determine if this prop is a getter on an intrinsic type
    const isIntrinsicGetter =
      (this._isSet && SET_GETTERS.includes(prop)) ||
      (this._isMap && MAP_GETTERS.includes(prop)) ||
      (this._isUint8Array && UINT8ARRAY_GETTERS.includes(prop))

    // Run intrinsic getters directly on target. Otherwise, they fail.
    if (isIntrinsicGetter) {
      // Notify on getting a intrinsic method
      if (this._handler._intrinsicGetMethod) this._handler._intrinsicGetMethod()

      // Getters for these supported types don't return inner values
      return Reflect.get(this._target, prop, this._target)
    }

    // Determine if this is a method on an intrinsic type
    const isIntrinsicMethod =
      (this._isSet && SET_METHODS.includes(prop)) ||
      (this._isMap && MAP_METHODS.includes(prop)) ||
      (this._isUint8Array && UINT8ARRAY_METHODS.includes(prop))

    // Wrap intrinsic methods
    if (isIntrinsicMethod) {
      const value = Reflect.get(this._target, prop, receiver)

      // Notify on getting a intrinsic method
      if (this._handler._intrinsicGetMethod) this._handler._intrinsicGetMethod()

      // If already wrapped, return directly
      if (INTRINSIC_METHODS.has(value)) return INTRINSIC_METHODS.get(value)

      // Otherwise, create a new wrapping and save it to be re-used
      // This wrapped method, like intrinsic prototype methods, is not specific to the instance
      const methodHandler = new IntrinsicMethodHandler(this._isSet, this._isMap, this._isUint8Array, prop)
      const methodProxy = new Proxy(value, methodHandler)
      INTRINSIC_METHODS.set(value, methodProxy)
      return methodProxy
    }

    // Otherwise, use the handler's get
    return this._handler._get
      ? this._handler._get(this._target, prop, receiver)
      : Reflect.get(this._target, prop, receiver)
  }

  static _getHandler (x) { return HANDLERS.get(x) }
  static _getTarget (x) { return TARGETS.get(x) }

  // Advanced. Be very sure you know what you are doing.
  static _setTarget (proxy, newTarget) {
    const oldTarget = TARGETS.get(proxy)
    const handler = HANDLERS.get(proxy)
    const originalHandler = ORIGINAL_HANDLERS.get(proxy)

    _assert(oldTarget)
    originalHandler._target = newTarget

    HANDLERS.delete(oldTarget)
    HANDLERS.set(newTarget, handler)
    TARGETS.set(proxy, newTarget)
  }
}

// ------------------------------------------------------------------------------------------------
// IntrinsicMethodHandler
// ------------------------------------------------------------------------------------------------

// Assumes intrinsic methods are already immutable and require no special handling
class IntrinsicMethodHandler {
  constructor (isSet, isMap, isUint8Array, prop) {
    this._isSet = isSet
    this._isMap = isMap
    this._basicUint8Array = isUint8Array

    this._prop = prop

    this._read = READ_METHODS.includes(prop)
    this._update = UPDATE_METHODS.includes(prop)

    this._returnsThis =
      (isSet && ['add'].includes(prop)) ||
      (isMap && ['set'].includes(prop)) ||
      (isUint8Array && ['copyWithin', 'fill', 'reverse', 'sort'].includes(prop))

    // Uint8Array instances don't need a proxy iterator because their values are primitives
    this._returnsWrappedIterator =
      (isSet && ['entries', 'values', Symbol.iterator].includes(prop)) ||
      (isMap && ['entries', 'keys', 'values', Symbol.iterator].includes(prop))

    // Most iterators return a single value each time. Pair iterators return two.
    this._pairIterator = this._returnsWrappedIterator && prop === 'entries'

    // Uint8Array instances don't need find to return a proxy value because it is a primitive
    this._returnsValue = isMap && prop === 'get'

    this._passesInFirstValue =
      (isSet && ['add', 'delete', 'has'].includes(prop)) ||
      (isMap && ['delete', 'get', 'has', 'set'].includes(prop))

    this._passesInSecondValue = isMap && prop === 'set'

    this._forEachCallback = (isSet && prop === 'forEach') || (isMap && prop === 'forEach')
  }

  apply (target, thisArg, args) {
    const handler = Proxy2._getHandler(thisArg)

    // Record inner reads and inner updates based on the method
    if (handler) {
      if (handler._intrinsicRead && this._read) handler._intrinsicRead()
      if (handler._intrinsicUpdate && this._update) handler._intrinsicUpdate()
    }

    // Convert arguments passed to callback functions if necessary
    if (this._forEachCallback) {
      args[0] = x => handler && handler._intrinsicOut && x ? handler._intrinsicOut(x) : x
    }

    // Convert the first argument going in if necessary
    if (this._passesInFirstValue && args[0] && handler && handler._intrinsicIn) {
      args[0] = handler._intrinsicIn(args[0])
    }

    // Convert the second argument going in if necessary
    if (this._passesInSecondValue && args[1] && handler && handler._intrinsicIn) {
      args[1] = handler._intrinsicIn(args[1])
    }

    // The the underlying intrinsic type if it exists
    const thisArgTarget = Proxy2._getTarget(thisArg) || thisArg

    // Run the function with the modified args on the original target
    const ret = Reflect.apply(target, thisArgTarget, args)

    // If this method is supposed to return self, return it
    if (this._returnsThis) return thisArg

    // If this method returns a single value, convert and return it
    if (this._returnsValue) return handler && handler._intrinsicOut && ret ? handler._intrinsicOut(ret) : ret

    // Iterator need to be specially handled
    if (this._returnsWrappedIterator) {
      return new SandboxedWrappedIterator(ret, handler, this._pairIterator)
    }

    // Otherwise, return the original return value, which is some non-inner object
    return ret
  }
}

// ------------------------------------------------------------------------------------------------
// SandboxedWrappedIterator
// ------------------------------------------------------------------------------------------------

// Iterator that can replace every value using a handler's _intrinsicOut method
class WrappedIterator {
  constructor (it, handler, pair) {
    this._it = it
    this._handler = handler
    this._pair = pair
  }

  next () {
    const n = this._it.next()

    const ret = {}
    ret.done = n.done
    ret.value = n.value

    if (this._handler && this._handler._intrinsicOut) {
      if (this._pair && ret.value) {
        const a = ret.value[0] ? this._handler._intrinsicOut(ret.value[0]) : ret.value[0]
        const b = ret.value[1] ? this._handler._intrinsicOut(ret.value[1]) : ret.value[1]
        ret.value = [a, b]
      } else {
        ret.value = ret.value ? this._handler._intrinsicOut(ret.value) : ret.value
      }
    }

    return ret
  }

  [Symbol.iterator] () { return this }
}

const native = true
const anonymize = false
const SandboxedWrappedIterator = Sandbox._sandboxType(WrappedIterator, {}, native, anonymize)[0]

// ------------------------------------------------------------------------------------------------

module.exports = Proxy2
