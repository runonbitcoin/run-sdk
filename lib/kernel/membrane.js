/**
 * membrane.js
 *
 * A flexible proxy handler for jigs, code, berries, their owned inner objects, and method args.
 */

const { _admin, _sudo } = require('./admin')
const {
  _assert, _text, _hasOwnProperty, _setOwnProperty, _serializable, _serializableValue,
  _RESERVED_PROPS, _RESERVED_CODE_PROPS, _RESERVED_JIG_PROPS, _RESERVED_BERRY_PROPS,
  _FINAL_CODE_PROPS, _FINAL_JIG_PROPS, _FINAL_BERRY_PROPS,
  _getOwnProperty, _basicSet, _basicMap, _defined, _basicUint8Array
} = require('./misc')
const { _deterministicCompareKeys, _deterministicDefineProperty } = require('./determinism')
const { _location, _owner, _satoshis, _LOCATION_BINDINGS, _UTXO_BINDINGS } = require('./bindings')
const { _deepClone, _deepVisit, _deepReplace } = require('./deep')
const Sandbox = require('./sandbox')
const SI = Sandbox._intrinsics
const HI = Sandbox._hostIntrinsics
const Proxy2 = require('./proxy2')
const { _unifyForMethod } = require('./unify')
const Rules = require('./rules')
const Editor = require('./editor')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const RECORD = () => require('./record')._CURRENT_RECORD
const STACK = () => RECORD()._stack

const CODE_METHOD = name => _sudo(() => Object.getPrototypeOf(require('./code').prototype)[name])

let CODE_METHOD_NAME_CACHE
function CODE_METHOD_NAMES () {
  if (!CODE_METHOD_NAME_CACHE) {
    const proto = _sudo(() => Object.getPrototypeOf(require('./code').prototype))
    CODE_METHOD_NAME_CACHE = Object.getOwnPropertyNames(proto).concat(Object.getOwnPropertySymbols(proto))
  }
  return CODE_METHOD_NAME_CACHE
}

// Objects that were assigned to the creation in one of its methods that is not yet finished.
// They are owned by the creation, but any gets should not return a proxy, because they
// need to match how they were assigned. Once all the creation methods complete, this
// set will be finalized and cleared, and future "gets" from other creations or the creation
// itself will be membranes. Inside pending is a membrane set under _membranes. There is also
// an _unbind boolean, as well as a _creation property for which jig is in pending.
let PENDING = null // { _membranes: Set, _unbind: boolean, _creation: Creation }

// ------------------------------------------------------------------------------------------------
// Membrane
// ------------------------------------------------------------------------------------------------

class Membrane {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (target, rules = new Rules()) {
    // Make sure the target really is a target
    _assert(!Proxy2._getTarget(target))

    // The proxy around the target that uses this membrane as its handler
    this._proxy = new Proxy2(target, this)

    // The rules for the membrane the determine the behavior below
    this._rules = rules

    // Determine the creation that the target is owned by
    this._creation = rules._creation || this._proxy

    // Proxies for inner objects so that we don't create new membranes
    if (!rules._creation) this._childProxies = new WeakMap() // Target -> Proxy

    // Return the proxy, not the membrane/handler, to the user
    return this._proxy
  }

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  _apply (target, thisArg, args) {
    if (this._isAdmin()) return Reflect.apply(target, thisArg, args)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Sidekick functions clear thisArg. It appears to be set by the sandbox. However, undefined
      // thisArg will be replaced with the global when in non-strict mode, so it is important
      // that all membraned functions operate in strict mode.
      // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call`
      const functionRules = this._rules
      if (functionRules._thisless) thisArg = undefined

      // Calling a function requires a read of the code jig for the function
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      // Distinguish betweent the target and the function rules. Both matter in methods.
      let thisArgMembrane = Proxy2._getHandler(thisArg)
      let thisArgRules = thisArgMembrane && thisArgMembrane._rules

      // Detect pass-through functions, which do not wrap arguments or get added to the record.
      // Pass-through functions might be sidekick functions. This may also be be init() on the
      // jig itself. If there's no init() method on a jig, then by design init() is pass-through
      // and the top-level action is the "new" action. The same is true for init() on berries and
      // the pluck action. Thsi is because the base init() method on Jig and other native code
      // does not record calls.
      let passThrough = !thisArgMembrane || !thisArgRules._recordableTarget || !functionRules._recordCalls

      // If pass through, see if we can make it not pass through! This might happen if
      // we are calling a sidekick function, like MyToken.mint, on an uninstalled class.
      if (functionRules._autocode && passThrough && typeof thisArg === 'function') {
        thisArg = Editor._lookupOrCreateCode(thisArg)
        thisArgMembrane = Proxy2._getHandler(thisArg)
        thisArgRules = thisArgMembrane && thisArgMembrane._rules
        passThrough = !thisArgMembrane || !thisArgRules._recordableTarget || !functionRules._recordCalls
      }

      // Berries require special handling to not be passthrough because they are sidekick code
      // We should find a better way to do this.
      const Berry = require('./berry')
      if (thisArg instanceof Berry && target.name === 'init') passThrough = false

      // Check that this method isn't disabled, like happens with init() for jigs and berries
      const disabledMethods = thisArgMembrane && thisArgMembrane._rules._disabledMethods
      const disabled = disabledMethods && disabledMethods.includes(target.name)
      if (disabled) throw new Error(`${target.name} disabled`)

      // We can only call recordable calls on other jigs
      if (functionRules._recordCalls && !thisArgMembrane) {
        throw new Error(`Cannot call ${target.name} on ${_text(thisArg)}`)
      }

      // If this method is pass through, then we run it directly. This is used for
      // sidekick code and inner methods. They don't need special handling. For inner
      // property methods, like a.arr.find(...), any gets will be handled by _get and
      // _intrinsicOut, which will have ownership protection.
      if (passThrough) return Reflect.apply(target, thisArg, args)

      // Detect when we are entering this creation from outside the sandbox or from another creation
      const crossing = !thisArgMembrane._inside()

      return RECORD()._capture(() => {
        // If entering the creation from outside, deep clone the args and unify worldview.
        // We only need to do this once at the top level. Inner args will already be prepared.
        if (!STACK().length) args = prepareArgs(thisArg, args)

        // Even internal method args need to have serializable args. Maybe we'll loosen this later.
        if (STACK().length) checkSerializable(args)

        // Check that we have access. Private methods cannot be called even from outside.
        thisArgMembrane._checkNotPrivate(target.name, 'call')

        // Clone the args whenever we cross membranes. We do this even if they are from the
        // outside and already cloned in prepareArgs, because this protects the top-level action.
        const callArgs = crossing ? _sudo(() => _deepClone(args, SI)) : args

        // We will wrap the return value at the end
        let ret = null

        // Save pending in case we are crossing to restore back after
        const savedPending = PENDING

        try {
          if (crossing || !PENDING) {
            PENDING = { _membranes: new Set(), _unbind: false, _creation: thisArg }
          }

          const performCall = () => {
            // Get the method on the target object from its name. This also checks that the target
            // method is the same. We do this to allow for class unification on jig objects. As
            // long as a function with the same name exists, we allow it to be called.
            const latestFunction = getLatestFunction(thisArg, this._proxy)
            if (!latestFunction) throw new Error(`Cannot call ${target.name} on ${_text(thisArg)}`)

            // Extract the target and creation from the function
            const latestFunctionTarget = Proxy2._getTarget(latestFunction)
            const latestFunctionCreation = Proxy2._getHandler(latestFunction)._creation

            // Calling a function requires a read of the code jig being called
            // We perform this again in case it wasn't captured above.
            if (this._shouldRecordRead()) RECORD()._read(latestFunctionCreation)

            // Perform the method
            ret = Reflect.apply(latestFunctionTarget, thisArg, callArgs)

            // Async methods are not supported. Even though the serializability check will catch
            // this, we check for it specifically here to provide a better error message.
            const wasAsyncMethod = ret instanceof SI.Promise || ret instanceof HI.Promise
            if (wasAsyncMethod) throw new Error('async methods not supported')

            // Check that the return value is serializable as a precaution before wrapping
            // The method may be returning anything. Wrappers won't catch it all right away.
            checkSerializable(ret)

            // Wrap the return value so that the caller knows we own it
            ret = thisArgMembrane._return(ret, crossing)

            // The pending membranes may have properties that need to be claimed, or unserializable
            // properties that are really uncaught errors. Handle both when we cross back.
            if (crossing) thisArgMembrane._finalizePending()
          }

          // Perform the call, whether recorded or not
          const recorded = !thisArgMembrane._rules._unrecordedMethods ||
            !thisArgMembrane._rules._unrecordedMethods.includes(target.name)
          const Action = require('./action')
          Action._call(thisArg, target.name, args, performCall, recorded)

          // As a safety check, as we are leaving this jig, check that any internal properties are
          // either targets, or they are creations. No proxies should be set internally. Because
          // otherwise, this will affect state generation. When confidence is 100%, we'll remove.
          if (crossing) {
            const Creation = require('./creation')
            _sudo(() => _deepVisit(Proxy2._getTarget(thisArg), x => {
              if (x instanceof Creation) return false // No traversing into other jigs
              _assert(!Proxy2._getTarget(x)) // All set properties must be targets
            }))
          }

          // Wrap the return value so the caller knows we own it
          return ret
        } finally {
          // No matter on error or not, save back pending before returning so membranes finalize
          PENDING = savedPending
        }
      })
    })
  }

  // --------------------------------------------------------------------------

  // Called when constructing arbitrary objects, and also jigs and berries. Construct is
  // pass-through. Jigs and berries have additional logic in their init() to become actions.

  _construct (target, args, newTarget) {
    if (this._isAdmin()) return Reflect.construct(target, args, newTarget)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Constructing an instance (a jig, a berry, or an arbitrary object), requires a read
      // of the class being constructed. If that constructor calls super, then it will read
      // the parent too, but to instantiate we only need to read the current class.
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      // Construct is passed through. We do not record constructions for replayability.
      // That is left up to the individual classes being created to record. For example,
      // the buit-in Jig class records the creation of new jigs, not this membrane.
      return Reflect.construct(target, args, newTarget)
    })
  }

  // --------------------------------------------------------------------------

  _defineProperty (target, prop, desc) {
    if (this._isAdmin()) return _deterministicDefineProperty(target, prop, desc)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Check if we can set this property
      this._checkCanChangeProp(prop, desc.value, 'define')

      // Only allow configurable, writable, enumerable value properties
      checkSetValidDescriptor(desc, true)

      // Defining a property requires an update to the jig
      if (this._shouldRecordUpdate()) RECORD()._update(this._creation)

      // Assign ownership of this value to ourselves, which may involve a copy
      desc.value = this._claim(desc.value)

      // When utxo bindings are set, the creation becomes unbound
      if (this._isUtxoBinding(prop)) PENDING._unbind = true

      // Define the property
      return _deterministicDefineProperty(target, prop, desc)
    })
  }

  // --------------------------------------------------------------------------

  _deleteProperty (target, prop) {
    if (this._isAdmin()) return Reflect.deleteProperty(target, prop)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      this._checkCanChangeProp(prop, undefined, 'delete')

      // Deleting a property requires an update to the jig
      if (this._shouldRecordUpdate()) RECORD()._update(this._creation)

      return Reflect.deleteProperty(target, prop)
    })
  }

  // --------------------------------------------------------------------------

  _get (target, prop, receiver) {
    if (this._isAdmin()) return Reflect.get(target, prop, receiver)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Code methods are returned directly. They are not reads since they don't change.
      // They also cannot be overriden, so we return them directly. The one exception
      // is Symbol.hasInstance, which our native Jig class overrides.
      const hasInstanceOverride = prop === Symbol.hasInstance &&
        target[Symbol.hasInstance] !== SI.Function.prototype[Symbol.hasInstance] &&
        target[Symbol.hasInstance] !== HI.Function.prototype[Symbol.hasInstance]
      if (this._isCodeMethod(prop) && !hasInstanceOverride) return CODE_METHOD(prop)

      // Unoverridable code, jig, or berry methods are not counted as reads
      if (this._isNativeProp(prop)) return Reflect.get(target, prop, receiver)

      // Make sure we are the class being read and not a child
      const isBinding = this._isLocationBinding(prop) || this._isUtxoBinding(prop)
      const differentReceiver = receiver !== this._proxy
      if (isBinding && differentReceiver) return undefined

      // Record this read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      // If this is a special property that we return directly, return it
      if (this._isPassThroughProp(prop)) return Reflect.get(target, prop, receiver)

      // Check if we are allowed to read this property
      this._checkCanGetProp(prop, 'get')

      // Read the value
      let value = Reflect.get(target, prop, receiver)
      if (!value) return value

      // Prepare the value for export
      const ownerCreation = this._getOwnerByName(prop)
      if (ownerCreation) value = Proxy2._getHandler(ownerCreation)._export(value)

      return value
    })
  }

  // --------------------------------------------------------------------------

  _getOwnPropertyDescriptor (target, prop) {
    if (this._isAdmin()) return Reflect.getOwnPropertyDescriptor(target, prop)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Props both final and reserved are never owned. They are also not reads.
      if (this._isNativeProp(prop)) return undefined

      // Record this read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      // If this is a special property that we return directly, return it
      if (this._isPassThroughProp(prop)) return Reflect.getOwnPropertyDescriptor(target, prop)

      // Check if we are allowed to read this property
      this._checkCanGetProp(prop, 'get descriptor for')

      // Read the descriptor
      const desc = Reflect.getOwnPropertyDescriptor(target, prop)
      if (!desc) return desc

      // Wrap this object with a membrane that enforces parent rules
      desc.value = this._export(desc.value)

      return desc
    })
  }

  // --------------------------------------------------------------------------

  _getPrototypeOf (target) {
    if (this._isAdmin()) return Reflect.getPrototypeOf(target)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Getting a prototype is a read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      return Reflect.getPrototypeOf(target)
    })
  }

  // --------------------------------------------------------------------------

  _has (target, prop) {
    if (this._isAdmin()) return Reflect.has(target, prop)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Checking a property is a read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      // Code, jig, and berry methods are part of the object, but not owned properties
      if (this._isFinalProp(prop)) return true

      // Check if we can access private properties
      this._checkNotPrivate(prop, 'check')

      // Some property names may be reserved for later, and no logic should depend on them
      this._checkNotReserved(prop, 'check')

      return Reflect.has(target, prop)
    })
  }

  // --------------------------------------------------------------------------

  _isExtensible (target) {
    if (this._isAdmin()) return Reflect.isExtensible(target)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Membrane targets are marked extensible by design. Immutability, if enabled, is enforced
      // in the membrane, not JavaScript, because non-extensibility can make JavaScript annoying.
      return true
    })
  }

  // --------------------------------------------------------------------------

  _ownKeys (target) {
    if (this._isAdmin()) return Reflect.ownKeys(target)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Getting key values is a read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)

      let keys = Reflect.ownKeys(target)

      // Always sort keys deterministically inside the membrane.
      keys = keys.sort(_deterministicCompareKeys)

      // Filter out private keys if we are not able to view them
      keys = keys.filter(key => this._hasPrivateAccess(key))

      return keys
    })
  }

  // --------------------------------------------------------------------------

  _preventExtensions (target) {
    if (this._isAdmin()) return Reflect.preventExtensions(target)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // This membrane does not support freezing the underlying object
      throw new Error('preventExtensions disabled')
    })
  }

  // --------------------------------------------------------------------------

  _set (target, prop, value, receiver) {
    // Using Reflect.set doesn't work. Parent proxies will intercept for classes.
    if (this._isAdmin()) { _setOwnProperty(target, prop, value); return true }

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // A creation may be trying to override a non-jig child class's sets
      if (receiver !== this._proxy) {
        _setOwnProperty(receiver, prop, value)
        return true
      }

      // Check if we can set this property
      this._checkCanChangeProp(prop, value, 'set')

      // Setting a value causes a spend
      if (this._shouldRecordUpdate()) RECORD()._update(this._creation)

      // Assign ownership this to ourselves, which may involve a copy
      value = this._claim(value)

      // When utxo bindings are set, the creation becomes unbound
      if (this._isUtxoBinding(prop)) PENDING._unbind = true

      // Using Reflect.set doesn't work. Parent proxies will intercept for classes.
      _sudo(() => _setOwnProperty(target, prop, value))

      return true
    })
  }

  // --------------------------------------------------------------------------

  _setPrototypeOf (target, prototype) {
    if (this._isAdmin()) return Reflect.setPrototypeOf(target, prototype)

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Changing prototypes is something only Run can do by design
      throw new Error('setPrototypeOf disabled')
    })
  }

  // --------------------------------------------------------------------------

  _intrinsicGetMethod () {
    if (this._isAdmin()) return

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Getting a method, even on an intrinsic, is a read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)
    })
  }

  // --------------------------------------------------------------------------

  _intrinsicOut (value) {
    if (this._isAdmin()) return value

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Wrap this object with a membrane that enforces parent rules
      return this._export(value)
    })
  }

  // --------------------------------------------------------------------------

  _intrinsicIn (value) {
    if (this._isAdmin()) return value

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Make sure this value is serializable
      checkSerializable(value)

      // Assign ownership of this value to ourselves, which may involve a copy
      value = this._claim(value)

      return value
    })
  }

  // --------------------------------------------------------------------------

  _intrinsicRead () {
    if (this._isAdmin()) return

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Getting a inner stored value, even on an intrinsic, is a read
      if (this._shouldRecordRead()) RECORD()._read(this._creation)
    })
  }

  // --------------------------------------------------------------------------

  _intrinsicUpdate () {
    if (this._isAdmin()) return

    return this._captureRecordErrors(() => {
      this._throwCreationError()

      // Updating a inner stored value, even on an intrinsic, is an update
      if (this._shouldRecordUpdate()) RECORD()._update(this._creation)

      // Check that the jig is updatable
      this._checkChangable('update', _text(this._creation))
    })
  }

  // --------------------------------------------------------------------------
  // _captureRecordErrors
  // --------------------------------------------------------------------------

  // Handler errors should not be caught by internal creation code because they are not part of
  // consensus. If they happen, we detect them ourselves to prevent them from being swallowed
  // and always rethrow them within the current action.
  _captureRecordErrors (f) {
    const CURRENT_RECORD = RECORD()

    try {
      const ret = f()
      // Check if there is an error again after the action to rethrow
      if (CURRENT_RECORD._error) throw CURRENT_RECORD._error

      // No error. Return the return value
      return ret
    } catch (e) {
      // Store the first error we see while in a method. They will get thrown on every handler hereafter.
      if (CURRENT_RECORD._stack.length && !CURRENT_RECORD._error) {
        CURRENT_RECORD._error = e
      }

      // Throw this error up to the outer action if there is one
      throw e
    }
  }

  // --------------------------------------------------------------------------
  // _throwCreationError
  // --------------------------------------------------------------------------

  // Every trap checks if the creation in an error state from a prior action. A creation will go
  // into an error state if the user fails to sync and there was an error while publishing.
  _throwCreationError () {
    // If location is not defined, then we are setting up the creation and not in an error state.
    // For example, toString() should still be allowed to be called when setting up.
    const creationTarget = Proxy2._getTarget(this._creation)
    if (!_hasOwnProperty(creationTarget, 'location')) return

    // Undeployed jigs can still be used because they will be deployed after the action completes.
    const { _error, _undeployed } = _location(creationTarget.location)
    if (_error && !_undeployed) throw new Error(_error)
  }

  // --------------------------------------------------------------------------
  // _checkCanChangeProp
  // --------------------------------------------------------------------------

  _checkCanChangeProp (prop, value, method) {
    // Prototype cannot be set directly
    if (prop === '__proto__') throw new Error(`${method} __proto__ disabled`)

    // Ensure the the property name is not a symbol
    if (typeof prop === 'symbol') throw new Error(`Cannot ${method} symbol property`)

    // Code, jig, and berry methods are permanent and cannot be overridden
    if (this._isFinalProp(prop)) throw new Error(`Cannot ${method} ${prop}: reserved`)

    // If this is a code option, check that it is a valid value
    this._checkCanChangeCodeOption(prop, value, method)

    // Only some bindings may be set by jig code
    this._checkCanChangeLocationBinding(prop, value, method)
    this._checkCanChangeUtxoBinding(prop, value, method)

    // Some property names may be reserved for later
    this._checkNotReserved(prop, method)

    // Check if we can set a private property
    this._checkNotPrivate(prop, method)

    // Check that the creation can be changed at all
    this._checkChangable(method, prop)

    // Ensure the the property value is serializable
    checkSerializable(value)
  }

  // --------------------------------------------------------------------------
  // _checkChangable
  // --------------------------------------------------------------------------

  _checkChangable (method, prop) {
    // Enforce immutability for static and native code
    if (this._rules._immutable) throw new Error(`Cannot ${method} ${prop}: immutable`)

    // Updates must be performed in one of the jig's methods
    this._checkIfSetInMethod()

    // The creation must not be unbound in its record
    if (RECORD()._unbound._has(this._creation)) throw new Error(`Cannot ${method} ${prop}: unbound`)
  }

  // --------------------------------------------------------------------------
  // _checkCanGetProp
  // --------------------------------------------------------------------------

  _checkCanGetProp (prop, method) {
    // Bindings are not always readable
    this._checkCanGetLocationBinding(prop)
    this._checkCanGetUtxoBinding(prop)

    // Check if we can access if it is a private property
    this._checkNotPrivate(prop, method)

    // Some property names may be reserved for later.
    // Reading them before they exist might break consensus.
    this._checkNotReserved(prop, method)
  }

  // --------------------------------------------------------------------------
  // _isPassThroughProp
  // --------------------------------------------------------------------------

  _isPassThroughProp (prop) {
    // Function prototypes must be returned directly. No wrapping. Run handles.
    if (typeof this._proxy === 'function' && prop === 'prototype') return true

    // Same for constructor
    if (prop === 'constructor') return true

    // Symbol properties are passed through because they aren't settable by the user
    if (typeof prop === 'symbol') return true

    return false
  }

  // --------------------------------------------------------------------------
  // _checkCanGetLocationBinding
  // --------------------------------------------------------------------------

  _checkCanGetLocationBinding (prop) {
    // Inner objects don't have bindings. Berry locations aren't mutable.
    if (!this._isLocationBinding(prop)) return

    try {
      const target = Proxy2._getTarget(this._proxy)

      // Check location, origin, or nonce. These are assigned by Run.
      if (prop === 'location' || prop === 'origin' || prop === 'nonce') {
        const val = Reflect.get(target, prop)

        // Treat nonce the same as location for determining readability
        const loc = _location(prop === 'nonce' ? target.location : val)

        if (_defined(loc._undeployed)) throw new Error('Hint: Sync the jig to deploy it')
        if (_defined(loc._error)) throw new Error(`A previous error occurred\n\n${loc._error}`)

        // Native code bindings can always be read
        if (_defined(loc._native)) return

        // If no txid, then the location is not determined.  The jig is in a pending commit.
        // Jig code won't encounter this but it protects users from getting temp locs.
        if (!_defined(loc._txid)) throw new Error('Hint: Sync the jig to assign it in a transaction')

        // Partial locations are unreadable
        if (_defined(loc._berry) && !_defined(loc._hash)) throw new Error()
      }
    } catch (e) {
      throw new Error(`Cannot read ${prop}${e.message ? '\n\n' + e.message : ''}`)
    }
  }

  // --------------------------------------------------------------------------
  // _checkCanGetUtxoBinding
  // --------------------------------------------------------------------------

  _checkCanGetUtxoBinding (prop) {
    // Inner objects don't have bindings. Berry locations aren't mutable.
    if (!this._isUtxoBinding(prop)) return

    try {
      const target = Proxy2._getTarget(this._proxy)

      // Check owner or satoshis. These are assigned by users and by Run.
      if (prop === 'owner' || prop === 'satoshis') {
        const value = Reflect.get(target, prop)

        const undetermined = typeof value === 'undefined'
        if (undetermined) throw new Error('Hint: Sync the jig to bind it in a transaction')

        const allowNull = true
        if (prop === 'owner') _owner(value, allowNull)

        const allowMaxInt = true
        if (prop === 'satoshis') _satoshis(value, allowMaxInt)
      }
    } catch (e) {
      throw new Error(`Cannot read ${prop}\n\n${e.message}`)
    }
  }

  // --------------------------------------------------------------------------
  // _checkCanChangeLocationBinding
  // --------------------------------------------------------------------------

  _checkCanChangeLocationBinding (prop, value, method) {
    // Inner objects can have properties with binding names set, but only Run
    // Run can set the origin, location and nonce on the creation.
    if (this._isLocationBinding(prop)) throw new Error(`Cannot ${method} ${prop}`)
  }

  // --------------------------------------------------------------------------
  // _checkCanChangeUtxoBinding
  // --------------------------------------------------------------------------

  _checkCanChangeUtxoBinding (prop, value, method) {
    // Inner objects can have properties with binding names set
    if (!this._isUtxoBinding(prop)) return

    // Prevent deleting any utxo bindings
    if (method === 'delete') throw new Error(`Cannot ${method} ${prop}`)

    // Once the jig is destroyed, UTXO bindings cannot change anymore
    if (this._deleted()) throw new Error(`Cannot ${method} ${prop}`)

    // Check the value being set is valid. Users cannot set owners to null, only Run.
    const allowNull = false
    if (prop === 'owner') _owner(value, allowNull)
    if (prop === 'satoshis') _satoshis(value)
  }

  // --------------------------------------------------------------------------
  // _checkCanChangeCodeOption
  // --------------------------------------------------------------------------

  _checkCanChangeCodeOption (prop, value, method) {
    if (!this._rules._codeProps) return
    if (prop === 'sealed' && method !== 'delete') Editor._checkSealedOption(value)
    if (prop === 'upgradable' && method !== 'delete') Editor._checkUpgradableOption(value)
    if (prop === 'interactive' && method !== 'delete') Editor._checkInteractiveOption(value)
  }

  // --------------------------------------------------------------------------
  // _checkNotReserved
  // --------------------------------------------------------------------------

  _checkNotReserved (prop, method) {
    if (!this._rules._reserved) return
    const throwReservedError = () => {
      const error = `Cannot ${method} ${typeof prop === 'symbol' ? prop.toString() : prop}: reserved`
      throw new Error(error)
    }
    if (_RESERVED_PROPS.includes(prop)) throwReservedError()
    if (this._rules._jigProps && _RESERVED_JIG_PROPS.includes(prop)) throwReservedError()
    if (this._rules._codeProps && _RESERVED_CODE_PROPS.includes(prop)) throwReservedError()
    if (this._rules._berryProps && _RESERVED_BERRY_PROPS.includes(prop)) throwReservedError()
  }

  // --------------------------------------------------------------------------
  // _checkNotPrivate
  // --------------------------------------------------------------------------

  _checkNotPrivate (prop, method) {
    const calling = method === 'call'
    const type = calling ? 'method' : 'property'
    const noAccess = !this._hasPrivateAccess(prop, calling)
    if (noAccess) throw new Error(`Cannot ${method} private ${type} ${prop}`)
  }

  // --------------------------------------------------------------------------
  // _hasPrivateAccess
  // --------------------------------------------------------------------------

  _hasPrivateAccess (prop, calling = false) {
    // Targets without private properties are always accessible
    if (!this._rules._privacy) return true

    // If this doesn't start with an unscore, its accessible
    if (typeof prop !== 'string' || !prop.startsWith('_')) return true

    // Prototype can always be retrieved
    if (prop === '__proto__') return true

    const Jig = require('./jig')
    const Berry = require('./berry')
    const stack = STACK()

    // Outside of a jig, private properties are always accessible.
    // Private methods however cannot be called even from outside.
    if (!stack.length) return !calling

    // Get the top of the stack
    const accessor = stack[stack.length - 1]

    // For jig code, the current class may access its private properties.
    // Also, any jig instances may call private methods on the jig class,
    // because they share the same code.
    if (typeof this._creation === 'function') {
      return accessor === this._creation || accessor.constructor === this._creation
    }

    // Handle jig and berry instances. Other kinds of proxies should not be here.
    _assert(this._creation instanceof Jig || this._creation instanceof Berry)

    // For jig instances, jigs of the same jig class may access the private properties.
    // Also, the jig class may access private properties of its instances. Same for berries.
    return accessor.constructor === this._creation.constructor ||
      accessor === this._creation.constructor
  }

  // --------------------------------------------------------------------------
  // _checkIfSetInMethod
  // --------------------------------------------------------------------------

  _checkIfSetInMethod () {
    if (!this._rules._smartAPI) return
    if (this._inside()) return
    throw new Error(`Attempt to update ${_text(this._creation)} outside of a method`)
  }

  // --------------------------------------------------------------------------
  // _export
  // --------------------------------------------------------------------------

  _export (value) {
    // Primitives are returned directly
    if (isBasicType(value)) return value

    // Creations are returned directly
    const Creation = require('./creation')
    if (value instanceof Creation) return value

    // If this was just created and claimed, and we're still inside the frame that created it,
    // then don't add a membrane. This ensures the following:
    //
    //    method() {
    //      const x = { }       // create local
    //      this.x = x          // claim it
    //      x === this.x        // true
    //    }
    //
    if (this._pending(value)) return value

    // Claimed and either not pending or exporting outside. Add our rules.
    return this._addParentRules(value)
  }

  // --------------------------------------------------------------------------
  // _return
  // --------------------------------------------------------------------------

  _return (value, crossing, unclaimed = new Set()) {
    // If this is a primitive type, it can't have a membrane
    if (isBasicType(value)) return value

    // If we've already detected this value is unclaimed, perhaps in a circular data structure,
    // then we should return it directly. Claimed values will not be recursing this way.
    if (unclaimed.has(value)) return value

    // If it already has a membrane, which will happen for prototype methods on native code,
    // and properties of other jigs, and also creations, then return it directly, because
    // it doesn't need additional wrapping. It'll be self-protected.
    if (Proxy2._getTarget(value)) return value

    // We know it has no membrane. Get whether we've already claimed it as ours.
    const pending = this._pending(value)

    // If this value is unclaimed, then we'll leave it intact, but we need to check inner objects
    // that might have gone undetected and if any are claimed then wrap them. Shallow replace is
    // essentially breadth-first traversal, which is what we want. We want to early-out as soon
    // as we hit a claimed object to wrap, because it'll wrap its sub-objects.
    if (!pending) {
      unclaimed.add(value)
      const wrapInner = x => this._return(x, crossing, unclaimed)
      _sudo(() => shallowReplace(value, wrapInner))
      return value
    }

    // If pending and returning internally to another of our method, then no membrane
    if (!crossing && pending) return value

    // Claimed and either not pending or exporting outside. Add our rules.
    return this._addParentRules(value)
  }

  // --------------------------------------------------------------------------
  // _addParentRules
  // --------------------------------------------------------------------------

  _addParentRules (value) {
    // Primitive types need no membranes
    if (isBasicType(value)) return value

    // If this value is already wrapped, then we won't wrap it again
    // This applies to creations and also prototype methods.
    if (Proxy2._getTarget(value)) return value

    // If we've already created a membrane for this target, return that one
    const childProxies = this._creationChildProxies()
    if (childProxies.has(value)) return childProxies.get(value)

    // Create a new membrane
    const method = typeof value === 'function'
    const rules = Rules._childProperty(this._creation, method)
    const proxy = new Membrane(value, rules)

    // Save the membrane to avoid dedups
    childProxies.set(value, proxy)

    return proxy
  }

  // --------------------------------------------------------------------------
  // _claim
  // --------------------------------------------------------------------------

  // Take ownership of the object and return it as an unproxied target suitable for storage
  _claim (value) {
    // Basic objects are never replaced because they are passed by value
    if (isBasicType(value)) return value

    // If this is a top-level jig, then it has its own owner
    const Creation = require('./creation')
    if (value instanceof Creation) return value

    const membrane = Proxy2._getHandler(value)
    const target = Proxy2._getTarget(value) || value

    // If there is no membrane, then we're dealing with a newly created object in the
    // jig's method, an unclaimed returned from another jig, or an object passed from
    // the user realm. In all cases, we take ownership by marking it pending. Objects inside
    // may be anything, but because once it goes pending it won't have a wrapper, we treat
    // all objects inside a pending object as unknown. Finalize will fix them. If we were to
    // dive recursively and remove membranes, we would mistakenly think values are pending
    // in future calls that aren't! We need to keep the membranes if they are in a pending.
    if (!membrane) {
      if (STACK().length && PENDING._membranes) PENDING._membranes.add(target)
      return target
    }

    // We already own it, so nothing to do. Its internals will already be ours.
    if (membrane._rules._creation === this._creation) return target

    // If the value is owned by another jig, make a clone. A new membrane will be created when
    // it is read. Do this without _sudo so that we can filter out private properties. We don't
    // actually need to record reads, because we would have done it already.
    return _deepClone(membrane._proxy, SI)
  }

  // --------------------------------------------------------------------------
  // _getOwnerByName
  // --------------------------------------------------------------------------

  // Determines the owner. The owner may be on a prototype. Assumes it exists.
  _getOwnerByName (prop) {
    let creation = this._creation
    let container = this._proxy

    // Walk up the prototype chain to find our prop. These will read.
    while (!_hasOwnProperty(container, prop)) {
      container = Object.getPrototypeOf(container)

      // The property should always exist if we are in this method
      _assert(container)

      // Get the class if we are on its prototype
      creation = typeof container === 'object' ? container.constructor : container

      // Make sure it is a creation. If not, it's an intrinsic like Object or Function, not a creation.
      const Creation = require('./creation')
      if (!(creation instanceof Creation)) creation = null

      // Because the prototype chain is not membraned, we record reads manually
      if (creation && this._shouldRecordRead() && Proxy2._getHandler(creation)._shouldRecordRead()) {
        RECORD()._read(creation)
      }
    }

    return creation
  }

  // --------------------------------------------------------------------------
  // _finalizePending
  // --------------------------------------------------------------------------

  _finalizePending () {
    _assert(PENDING)

    // Walk through all inner properties of the pending membranes and make sure
    // their values are allowed, performing the same checks we would do in "set".
    // This has to be done at the end of a method because for pending membranes the
    // user is able to directly set values without checks and we can't stop that then.
    _deepReplace(PENDING._membranes, (x, recurse) => {
      // x must be serializable on its own. Ignore deep serializability, because deepReplace.
      if (!_serializableValue(x)) throw new Error(`Not serializable: ${_text(x)}`)

      // Primitives are always safe
      if (isBasicType(x)) return

      // Creations are left intact, and we don't recurse into them, because
      // we are only considering pending membranes on the current jig.
      const Creation = require('./creation')
      if (x instanceof Creation) { recurse(false); return }

      // Check that the object has only valid names - no reserved, symbols, getters, etc.
      checkValidPropFields(x)

      // Non-proxied objects are left intact, but we have to traverse to check their inners.
      // These would be objects created or unclaimed from another jig, and then assigned in the
      // current method.
      const xmembrane = Proxy2._getHandler(x)
      if (!xmembrane) { recurse(true); return }

      // We know it is proxied either from us or from another creation
      const target = Proxy2._getTarget(x)

      // By having a membrane, one of our invariants is that we know the target was already
      // checked for serializability. Therefore, we don't need to recurse.
      recurse(false)

      // If its ours, remove the membrane and assign. We only store targets.
      if (xmembrane._rules._creation === this._creation) return target

      // The creation is not ours. It must be a property from another jig. We clone it.
      // Don't use _sudo() because this allows us to filter out private properties.
      return _deepClone(xmembrane._proxy, SI)
    })

    // Deleted creations are by definition unbound
    if (this._deleted()) PENDING._unbind = true

    // If either the owner or satoshis were changed, the creation becomes unbound
    if (PENDING._unbind) RECORD()._unbind(this._creation)
  }

  // --------------------------------------------------------------------------
  // _pending
  // --------------------------------------------------------------------------

  _pending (value) {
    // If we have no pending set, and not in a method, then value can't be pending
    if (!PENDING) return false

    // If the value has a proxy, it can't be pending. Pending is only for new objects.
    if (Proxy2._getTarget(value)) return false

    // The pending membrane set is only valid for the creation at the top of the stack
    const stack = RECORD()._stack
    const inside = stack.length && stack[stack.length - 1] === this._creation
    if (!inside) return false

    // Return claimed and pending membranes we know about. We might not know them all.
    if (PENDING._membranes.has(value)) return true

    // We may have assigned to a pending claim. It would not be in our PENDING membranes set,
    // so we must deep traverse to see if its ours. As we traverse, if we hit another
    // proxy object, we can stop, because any pending values that were assigned to that
    // proxy would already be accessible from non-pending objects in the PENDING membranes set.
    // This includes creations.
    let pending = false
    _deepVisit(PENDING._membranes, x => {
      if (pending) return false // Stop traversing once we know we're pending
      if (Proxy2._getTarget(x)) return false
      if (x === value) { pending = true; return false }
    })

    // Save pending for quicker checks later
    if (pending) PENDING._membranes.add(value)

    return pending
  }

  // --------------------------------------------------------------------------
  // Misc Helpers
  // --------------------------------------------------------------------------

  _isAdmin () { return this._rules._admin && _admin() }
  _isCodeMethod (prop) { return this._rules._codeProps && CODE_METHOD_NAMES().includes(prop) }
  _isFinalProp (prop) { return this._isFinalCodeProp(prop) || this._isFinalJigProp(prop) || this._isFinalBerryProp(prop) }
  _isFinalCodeProp (prop) { return this._rules._codeProps && _FINAL_CODE_PROPS.includes(prop) }
  _isFinalJigProp (prop) { return this._rules._jigProps && _FINAL_JIG_PROPS.includes(prop) }
  _isFinalBerryProp (prop) { return this._rules._berryProps && _FINAL_BERRY_PROPS.includes(prop) }
  _isNativeProp (prop) {
    return (this._isFinalCodeProp(prop) && _RESERVED_CODE_PROPS.includes(prop)) ||
        (this._isFinalJigProp(prop) && _RESERVED_JIG_PROPS.includes(prop)) ||
        (this._isFinalBerryProp(prop) && _RESERVED_BERRY_PROPS.includes(prop))
  }

  _shouldRecordRead () { return this._rules._recordReads && STACK().length }
  _shouldRecordUpdate () { return this._rules._recordUpdates && STACK().length }
  _isLocationBinding (prop) { return this._rules._locationBindings && _LOCATION_BINDINGS.includes(prop) }
  _isUtxoBinding (prop) { return this._rules._utxoBindings && _UTXO_BINDINGS.includes(prop) }
  _inside () { const s = STACK(); return s.length && s[s.length - 1] === this._creation }

  _creationChildProxies () { return Proxy2._getHandler(this._creation)._childProxies }
  _deleted () {
    const target = Proxy2._getTarget(this._creation)
    return target.owner === null && target.satoshis === 0
  }

  _pendingUnbind () { return PENDING && PENDING._creation === this._creation && PENDING._unbind }
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function isBasicType (value) {
  const basicTypes = ['undefined', 'boolean', 'number', 'string', 'symbol']
  return basicTypes.includes(typeof value) || value === null
}

// ------------------------------------------------------------------------------------------------

function checkSetValidDescriptor (desc, mustBeConfigurable = true) {
  // On Chrome and Firefox, properties are copied from their existing descriptor.
  // On Safari, properties must be specified. We require Safari's conservative behavior.

  if (!('value' in desc)) throw new Error('Descriptor must have a value')
  if ('get' in desc) throw new Error('Getters are not supported')
  if ('set' in desc) throw new Error('Getters are not supported')
  if (mustBeConfigurable && !desc.configurable) throw new Error('Descriptor must be configurable')
  if (!desc.writable) throw new Error('Descriptor must be writable')
  if (!desc.enumerable) throw new Error('Descriptor must be enumerable')
}

// ------------------------------------------------------------------------------------------------

function checkSerializable (value) {
  if (!_serializable(value)) throw new Error(`Not serializable: ${_text(value)}`)
}

// ------------------------------------------------------------------------------------------------

function checkValidPropFields (x) {
  _sudo(() => {
    // Symbol properties are allowed because we cannot serialize them
    const symbols = Object.getOwnPropertySymbols(x).length
    if (symbols) throw new Error('Symbol properties not supported')

    // Array length is non-configurable and non-enumerable and allowed
    const filter = []
    if (x instanceof SI.Array || x instanceof HI.Array) filter.push('length')

    // Uint8array elements should all be configurable when returned.
    // See: 2020-10-17 https://webkit.googlesource.com/WebKit/+/master/Source/JavaScriptCore/ChangeLog
    // See: Description https://github.com/tc39/ecma262/pull/2164
    // Still, node.js and some browsers return non-configurable entries, even though they may be changed.
    const mustBeConfigurable = !_basicUint8Array(x)

    // Getters and setters are not supported
    Object.getOwnPropertyNames(x)
      .filter(name => !filter.includes(name))
      .map(name => Object.getOwnPropertyDescriptor(x, name))
      .forEach(desc => checkSetValidDescriptor(desc, mustBeConfigurable))
  })
}

// ------------------------------------------------------------------------------------------------

function getLatestFunction (thisArg, functionProxy) {
  // No this, then we are always the latest
  if (!thisArg) return functionProxy

  // Only creations can have creation methods called on them
  const Creation = require('./creation')
  if (!(thisArg instanceof Creation)) return null

  const functionTarget = Proxy2._getTarget(functionProxy)
  const functionName = functionTarget.name

  // If a method of this name is not on the this target, then we can't call it
  if (typeof thisArg[functionName] !== 'function') return null

  // If this is our method, then we can call it
  if (thisArg[functionName] === functionProxy) return functionProxy

  const functionCreation = Proxy2._getHandler(functionProxy)._creation
  const functionCreationOrigin = _sudo(() => functionCreation.origin)
  const functionCreationNonce = _sudo(() => functionCreation.nonce)

  const thisArgMembrane = Proxy2._getHandler(thisArg)
  const thisArgFunctionCreation = thisArgMembrane._getOwnerByName(functionName)
  const thisArgFunctionCreationOrigin = _sudo(() => thisArgFunctionCreation.origin)
  const thisArgFunctionCreationNonce = _sudo(() => thisArgFunctionCreation.nonce)

  // If thisArg's class was replaced with a newer version of the function, check that the
  // origins are the same, and that we aren't using an older version! Then we can use it.
  if (thisArgFunctionCreationOrigin === functionCreationOrigin) {
    if (thisArgFunctionCreationNonce < functionCreationNonce) throw new Error('Method time travel')
    return thisArg[functionName]
  }

  // The method we are trying to call is not the one on the creation's public API. It may be
  // a super method, which we allow only from inside the current jig.

  // Check if we are inside one of the current jig's methods.
  const stack = RECORD()._stack
  const inside = stack.length >= 2 && stack[stack.length - 2] === thisArg
  if (!inside) return null

  // We are inside, so now find out if this method is in our class chain
  let prototype = Object.getPrototypeOf(thisArg)
  while (prototype) {
    const prototypeMethod = _getOwnProperty(prototype, functionName)
    if (prototypeMethod === functionProxy) return prototypeMethod

    // If the method was upgraded on a parent but its still part of the same class, we can call it
    const prototypeMethodContainer = typeof prototype === 'function' ? prototype : prototype.constructor

    if (prototypeMethod && _sudo(() => prototypeMethodContainer.origin === functionCreationOrigin)) {
      _sudo(() => {
        if (prototypeMethodContainer.nonce < functionCreationNonce) throw new Error('Method time travel')
      })
      return prototypeMethod
    }

    prototype = Object.getPrototypeOf(prototype)
  }

  // Attempt to call a method that is not our own
  return null
}

// ------------------------------------------------------------------------------------------------

function prepareArgs (thisArg, args) {
  const Code = require('./code')

  // If thisArg is already code, make sure its deployed
  if (thisArg instanceof Code) Editor._get(thisArg)._deploy()

  // Clone the value using sandbox intrinsics
  const Creation = require('./creation')
  const clonedArgs = _deepClone(args, SI, x => {
    if (typeof x === 'function' && !(x instanceof Creation)) {
      const C = Editor._lookupOrCreateCode(x)
      Editor._get(C)._deploy()
      return C
    }

    // If x is already code, make sure its deployed
    if (x instanceof Code) Editor._get(x)._deploy()
  })

  _unifyForMethod([thisArg, clonedArgs], [thisArg])

  return clonedArgs
}

// ------------------------------------------------------------------------------------------------

function shallowReplace (x, replacer) {
  Object.keys(x).forEach(name => {
    _setOwnProperty(x, name, replacer(x[name]))
  })

  if (_basicSet(x)) {
    const values = Array.from(x.values())
    x.clear()
    values.forEach(value => x.add(replacer(value)))
  }

  if (_basicMap(x)) {
    const entries = Array.from(x.entries())
    x.clear()
    entries.forEach(([key, value]) => x.set(replacer(key), replacer(value)))
  }
}

// ------------------------------------------------------------------------------------------------

Membrane._prepareArgs = prepareArgs

module.exports = Membrane
