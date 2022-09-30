/**
 * editor.js
 *
 * Manager for jig and sidekick code
 */

const {
  _text, _activeKernel, _parent, _anonymous, _defined, _CODE,
  _basicObject, _hasOwnProperty, _setOwnProperty, _assert, _extendsFrom,
  _RESERVED_PROPS, _RESERVED_CODE_PROPS, _RESERVED_JIG_PROPS
} = require('./misc')
const CreationSet = require('./creation-set')
const { _unifyForMethod } = require('./unify')
const Dynamic = require('./dynamic')
const Log = require('./log')
const { _deepClone, _deepVisit } = require('./deep')
const Bindings = require('./bindings')
const { _sudo } = require('./admin')
const { _BINDINGS, _location, _nonce, _owner, _satoshis } = Bindings
const Rules = require('./rules')
const Sandbox = require('./sandbox')
const Proxy2 = require('./proxy2')
const { ArgumentError } = require('./error')
const Source = require('./source')
const SI = Sandbox._intrinsics

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Editor'

// Mapping of code to their editors
const EDITORS = new WeakMap() // Code -> Editor

// Mapping of local types to their network-specific code
const REPOSITORY = {} // { [network]: Map<T, C> }

// Preinstalls that will move into an actual repository once run is activated
const PREINSTALLS = new Map() // T -> C

// Map of names to native code
const NATIVE = {} // { [name]: Code }

// ------------------------------------------------------------------------------------------------
// Editor
// ------------------------------------------------------------------------------------------------

/**
 * Every code jig has an editor that may be used to perform internal operations
 */
class Editor {
  _init (C, D) {
    this._T = undefined // Installed type, which changes with upgrades
    this._D = D // Dynamic type
    this._C = C // Code type
    this._name = undefined
    this._src = undefined
    this._preinstalled = false // Whether this class was partially installed
    this._installed = false // Whether anything was installed
    this._local = false // Whether code is a local type
    this._network = '' // Network, if non-native and installed
    try { this._network = _activeKernel()._blockchain.network } catch (e) { }
    this._native = undefined // Whether a native type
    this._internal = false // Whether internal-only if native
  }

  // --------------------------------------------------------------------------

  /**
   * Sets the inner type of this code jig and ensures it is valid for a jig
   *
   * This is used by both deploy and upgrade.
   *
   * If local is false, then T is assumed to already be sandboxed via makeSandbox.
   */
  _install (T, local = true, newCode = [], src) {
    const Code = require('./code')

    if (Log._debugOn) Log._debug(TAG, 'Install', _text(T))

    // If preinstalled, finish installing
    if (this._preinstalled) {
      _assert(T === this._T || T === this._C)
      return this._postinstall()
    }

    // Native code cannot be upgraded
    _assert(!this._native)

    // Save the old inner type that we're replacing, in case of a rollback
    const oldInnerType = Dynamic._getInnerType(this._D)

    // Create a repository for the network if one doesn't exist
    REPOSITORY[this._network] = REPOSITORY[this._network] || new Map()

    // Pre-emptively add the new type to the repository if its local
    REPOSITORY[this._network].delete(this._T)
    if (local) REPOSITORY[this._network].set(T, this._C)

    try {
      this._setupBehavior(T, local, newCode)
      this._setupPresets()
      this._setupBindings(this._installed ? oldInnerType : null)

      // Success. Update the editor.
      this._T = T
      this._name = T.name
      this._src = src || Source._deanonymize(this._D.toString(), this._name)
      this._local = local
      this._preinstalled = false
      this._installed = true
      this._native = false
      this._internal = false

      // If there were presets, we have a couple other things to do
      if (_hasOwnProperty(T, 'presets') && _hasOwnProperty(T.presets, this._network) &&
        _hasOwnProperty(T.presets[this._network], 'location')) {
        // First, make sure all code referenced by this code are also deployed
        _sudo(() => _deepVisit(this._C, x => {
          if (x instanceof Code && x !== this._C) {
            if (_location(x.location)._undeployed) {
              throw new ArgumentError(`${_text(x)} must have presets`)
            }
          }
        }))

        // Second, apply presets to the local type as if we received a publish event
        this._copyBindingsToLocalType(this._T.presets[this._network])
      }
    } catch (e) {
      // Failure. Set the repository back to storing the old local type
      REPOSITORY[this._network].delete(T)
      if (this.local) REPOSITORY[this._network].set(this._T, this._C)

      // Set back the old local type onto the dynamic
      Dynamic._setInnerType(this._D, oldInnerType)

      // Rethrow
      throw e
    }
  }

  // --------------------------------------------------------------------------

  /**
   * Removes the local type for this code. The code may continue to be used.
   */
  _uninstall () {
    if (this._native) throw new Error('Cannot uninstall native code')

    // Remove from repository
    if (this._installed) {
      REPOSITORY[this._network].delete(this._T)
      this._installed = false
    }

    // Remove from preinstalls
    if (this._preinstalled) {
      PREINSTALLS.delete(this._T)
      this._preinstalled = false
    }

    // Delete bindings and presets off of original type
    if (this._T) {
      _BINDINGS.forEach(name => { delete this._T[name] })
      delete this._T.presets
    }

    // Delete the custom hasInstance attachment if we added it
    if (_hasOwnProperty(this._T, Symbol.hasInstance)) {
      delete this._T[Symbol.hasInstance]
    }

    // Clear settings
    this._T = undefined
    this._local = false
  }

  // --------------------------------------------------------------------------

  _preinstall (T) {
    // If already preinstalled, nothing to do
    if (this._preinstalled) return

    // If we've already activated run and have a network, then just install
    let active = true
    try { _activeKernel() } catch (e) { active = false }
    if (active) { this._install(T); return }

    if (Log._debugOn) Log._debug(TAG, 'Preinstall', _text(T))

    // Make sure user is not preinstalling an already installed class
    if (this._installed || this._native) throw new Error(`Cannot preinstall ${_text(T)}`)

    // Save this class into our preinstall set
    PREINSTALLS.set(T, this._C)

    try {
      // Setup our behavior. We don't setup presets or bindings.
      this._setupBehavior(T, true)

      // Success. Update the editor.
      this._T = T
      this._name = T.name
      this._src = Source._deanonymize(this._D.toString(), this._name)
      this._local = true
      this._preinstalled = true
      this._installed = false
      this._native = false
      this._internal = false
    } catch (e) {
      PREINSTALLS.delete(T)

      // Rethrow
      throw e
    }
  }

  // --------------------------------------------------------------------------

  _postinstall () {
    if (!this._preinstalled) return

    if (Log._debugOn) Log._debug(TAG, 'Postinstall', _text(this._T))

    // Try getting the new network
    this._network = _activeKernel()._blockchain.network

    try {
      // Remove from the preinstall set
      PREINSTALLS.delete(this._T)

      // Create a repository for the network if one doesn't exist
      REPOSITORY[this._network] = REPOSITORY[this._network] || new Map()

      // Pre-emptively add the new type to the repository if its local
      REPOSITORY[this._network].set(this._T, this._C)

      // Finish configuring the code with our now-known network
      this._setupPresets()
      this._setupBindings()

      // Update the editor
      this._preinstalled = false
      this._installed = true

      // Postinstall all dependencies
      const Code = require('./code')
      const postinstallDep = x => { if (x instanceof Code) Editor._get(x)._postinstall() }
      _sudo(() => _deepVisit(this._C, postinstallDep))
    } catch (e) {
      PREINSTALLS.set(this._T, this._C)
      REPOSITORY[this._network].delete(this._T)
      this._network = ''
      throw e
    }
  }

  // --------------------------------------------------------------------------

  _setupBehavior (T, local = false, newCode = []) {
    // Create the sandbox if T is not sandboxed
    const S = local ? makeSandbox(this._C, T, local, newCode)[0] : T

    const Jig = require('./jig')
    const Berry = require('./berry')

    // Determine the membrane rules for this type of code
    let rules = null
    if (_extendsFrom(T, Jig)) {
      rules = Rules._jigCode()
    } else {
      const isClass = T.toString().startsWith('class')
      rules = Rules._sidekickCode(isClass)
    }

    // Configure the membrane for these rules
    Proxy2._getHandler(this._C)._rules = rules

    // Make sure we only upgrade jigs to jigs, and non-jigs to non-jigs
    if (this._installed) {
      const beforeJig = _extendsFrom(this._T, Jig)
      const afterJig = _extendsFrom(T, Jig)
      if (beforeJig !== afterJig) throw new Error('Cannot change jigs to sidekicks, or vice versa')
    }

    // Make sure we do not allow berries to be upgraded from or to
    if (this._installed && _extendsFrom(this._T, Berry)) {
      throw new Error(`Cannot upgrade from berry class: ${_text(this._T)}`)
    }
    if (this._installed && _extendsFrom(T, Berry)) {
      throw new Error(`Cannot upgrade to berry class: ${_text(T)}`)
    }

    // Turn the prototype methods into membranes. Must do this before the inner type is set.
    addMembranesToPrototypeMethods(S, this._C)

    // Make instanceof checks pass with the local type
    hijackLocalInstanceof(T)

    // Set the sandboxed type to the jig
    Dynamic._setInnerType(this._D, S)
  }

  // --------------------------------------------------------------------------

  _setupPresets () {
    _sudo(() => {
      // Apply presets onto the sandbox
      if (_hasOwnProperty(this._C, 'presets')) {
        const npresets = this._C.presets[this._network]
        const presetNames = Object.getOwnPropertyNames(npresets || {})
        presetNames.forEach(name => _setOwnProperty(this._C, name, npresets[name]))

        // Remove presets from code jigs. They are for local types only.
        delete this._C.presets
      }
    })
  }

  // --------------------------------------------------------------------------

  _setupBindings (bindingsToCopy) {
    _sudo(() => {
      if (bindingsToCopy) {
        // Upgrade. Copy over bindings.
        _BINDINGS.forEach(name => _setOwnProperty(this._C, name, bindingsToCopy[name]))
      } else {
        // New install. Setup first-time bindings if no presets.
        if (!_hasOwnProperty(this._C, 'location')) Bindings._markUndeployed(this._C)
      }
    })
  }

  // --------------------------------------------------------------------------

  _installNative (T, internal = false) {
    if (Log._debugOn) Log._debug(TAG, 'Install native', _text(T))

    // Cannot install non-native code to native code
    _assert(this._native === undefined)

    // Parents not allowed
    _assert(!_parent(T))

    // Only one name allowed for native code
    _assert(!(T.name in NATIVE))

    // Sandbox the native code. Props not copied.
    const env = {}
    const native = true
    const anonymize = false
    const [S, SGlobal] = Sandbox._sandboxType(T, env, native, anonymize)
    Object.assign(SGlobal, T.deps)

    // Save allowed options in case we delete them in the next line
    const sealed = T.sealed
    const upgradable = T.upgradable
    const interactive = T.interactive

    // If in cover mode, delete the props. Because otherwise when S === T deps cause problems.
    if (process.env.COVER) Object.keys(S).forEach(key => { delete S[key] })

    // Copy allowed options onto sandbox
    if (_defined(sealed)) _setOwnProperty(S, 'sealed', sealed)
    if (_defined(upgradable)) _setOwnProperty(S, 'upgradable', upgradable)
    if (_defined(interactive)) _setOwnProperty(S, 'interactive', interactive)

    // Turn the prototype methods into membranes. Must do this before the inner type is set.
    addMembranesToPrototypeMethods(S, this._C)

    // Set the sandboxed type to the code
    Dynamic._setInnerType(this._D, S)

    // Set native bindings
    S.origin = `native://${T.name}`
    S.location = `native://${T.name}`
    S.nonce = 0
    S.owner = null
    S.satoshis = 0

    // Add this as a native type
    NATIVE[T.name] = this._C

    // Configure the membrane for native code
    Proxy2._getHandler(this._C)._rules = Rules._nativeCode()

    // Set editor properties
    this._T = T
    this._name = T.name
    this._src = Source._deanonymize(this._D.toString(), this._name)
    this._preinstalled = false
    this._installed = true
    this._local = true
    this._native = true
    this._internal = internal
  }

  // --------------------------------------------------------------------------

  _deploy () {
    if (Log._infoOn) Log._info(TAG, 'Deploy', _text(this._C))

    // Native code does not deploy
    if (this._native) return

    // Post install if necessary
    this._postinstall()

    // Use our deploy helper with only ourselves
    deployMultiple(this._C)
  }

  // --------------------------------------------------------------------------

  // For easy of use, local types that are not sandboxed nor jigs are still assigned locations
  // after their code is deployed. This allows local code to check locations and origins
  // easily. However, it is not fully reliable because updated props are not copied over.
  // As a jig is updated, these local types are not updated with them. We save just the
  // initial deployment bindings.
  _copyBindingsToLocalType (bindings) {
    // If not a local type, nothing to copy
    if (!this._local) return
    const T = this._T

    // Create slots for the presets if they aren't there
    if (!_hasOwnProperty(T, 'presets')) _setOwnProperty(T, 'presets', {})
    if (!_hasOwnProperty(T.presets, this._network)) _setOwnProperty(T.presets, this._network, {})

    // Set each binding only once if we don't have it
    _sudo(() => {
      _BINDINGS.forEach(x => {
        const presets = T.presets[this._network]
        if (!_hasOwnProperty(presets, x)) _setOwnProperty(presets, x, bindings[x])
        if (!_hasOwnProperty(T, x)) _setOwnProperty(T, x, bindings[x])
      })
    })
  }

  // --------------------------------------------------------------------------

  /**
   * Checkpoints a version of this code in case of a revert
   */
  _save () {
    return {
      _C: this._C,
      _T: this._T,
      _name: this._name,
      _src: this._src,
      _innerType: Dynamic._getInnerType(this._D)
    }
  }

  // --------------------------------------------------------------------------

  /**
   * Restores a previous checkpoint
   */
  _restore (savepoint) {
    _assert(this._C === savepoint._C)
    this._T = savepoint._T
    this._name = savepoint._name
    this._src = savepoint._src
    Dynamic._setInnerType(this._D, savepoint._innerType)
  }
}

// ------------------------------------------------------------------------------------------------
// createCode
// ------------------------------------------------------------------------------------------------

/**
   * Creates a blank code jig
   *
   * Notes
   *  - This is intended only to be called internally.
   *  - If T is specified, the Code will automatically create Code for T.
   *  - If local is true, T will be sandboxed and its bindings updated.
   */
function createCode (T, local = true, newCode = []) {
  // Check if T is already installed as code
  _assert(!lookupCodeByType(T))

  // Create a new dynamic type that allows for upgrades
  const D = new Dynamic()

  // Also create an editor that allows us to store metadata and act on this code
  const editor = new Editor()

  // Wrap the dynamic type in the membrane to create the code
  const Membrane = require('./membrane')
  const C = new Membrane(D)

  // Make the dynamic's outer type, its constructor, be the new code
  Dynamic._setOuterType(D, C)

  // Initialize the editor with the code jig and also the dynamic type
  editor._init(C, D)

  // Add the code and editor enabling instanceof checks and other lookups
  EDITORS.set(C, editor)

  // Add the code to the creation set
  _CODE.add(C)

  // Install T if it was provided
  if (T) editor._install(T, local, newCode)

  // Also add ourselves to the new code list
  newCode.push(C)

  // Return the code jig, not this instance, to the caller.
  // The membrane will hook up the methods below.
  return C
}

// ------------------------------------------------------------------------------------------------
// lookupOrCreateCode
// ------------------------------------------------------------------------------------------------

function lookupOrCreateCode (T, local = true, newCode = []) {
  return lookupCodeByType(T) || createCode(T, local, newCode)
}

// ------------------------------------------------------------------------------------------------
// upgradeCode
// ------------------------------------------------------------------------------------------------

function upgradeCode (C, T, local = true, src = undefined) {
  const Record = require('./record')
  const Snapshot = require('./snapshot')
  const Action = require('./action')

  if (Log._debugOn) Log._debug(TAG, 'Upgrade', _text(C), 'to', _text(T))

  // Upgrade can only be called externally
  if (Record._CURRENT_RECORD._stack.length) throw new Error('upgrade unavailable')

  // Non-jig child classes and native code cannot be upgraded. Errors.
  const editor = Editor._get(C)
  if (!editor || editor._native) throw new Error('upgrade unavailable')

  // Non-upgradable code cannot be upgraded
  const upgradable = _sudo(() => !_hasOwnProperty(C, 'upgradable') || C.upgradable)
  if (!upgradable) throw new Error(`${_text(C)} is non-upgradable`)

  // Save a snapshot in case we need to rollback
  const snapshot = new Snapshot(C)

  try {
    // Install the new type on our code to upgrade it
    const newCode = []
    editor._install(T, local, newCode, src)

    // Record potentially multiple actions for upgrade
    Record._CURRENT_RECORD._capture(() => {
      // Deploy each new code needed to upgrade
      if (newCode.length) deployMultiple(...newCode)

      // Upgrade the code
      Action._upgrade(C, snapshot)
    })
  } catch (e) {
    snapshot._rollback(e)
    throw e
  }
}

// ------------------------------------------------------------------------------------------------
// Install helpers
// ------------------------------------------------------------------------------------------------

function checkType (T) {
  const Jig = require('./jig')
  const Berry = require('./berry')
  if (typeof T !== 'function') throw new ArgumentError(`Only functions and classes are supported: ${_text(T)}`)
  checkNoReservedWords(T)
  if (_extendsFrom(T, Jig)) checkValidJigClass(T)
  if (_extendsFrom(T, Berry)) checkValidBerryClass(T)
  if (T.prototype && T.prototype.constructor !== T) throw new ArgumentError(`Prototypal inheritance not supported: ${_text(T)}`)
  if (_anonymous(T)) throw new ArgumentError(`Anonymous types not supported: ${_text(T)}`)
  if (T.toString().indexOf('[native code]') !== -1) throw new ArgumentError(`Cannot install intrinsic: ${_text(T)}`)
  checkNoSymbolMethods(T)
  checkNoAccessors(T)
}

// ------------------------------------------------------------------------------------------------

function checkDeps (T, ParentCode) {
  if (!_hasOwnProperty(T, 'deps')) return

  // Deps must be an object if it exists
  if (!_basicObject(T.deps)) throw new ArgumentError('deps must be a basic object')

  // Ensure that if there is a parent, it matches what's actually the parent
  if (ParentCode) {
    const DepParent = T.deps[ParentCode.name]
    const DepParentCode = lookupCodeByType(DepParent)
    if (DepParent && !CreationSet._sameCreation(DepParentCode, ParentCode)) throw new ArgumentError('Parent dependency mismatch')
  }

  // Ensure there are no dependencies named T
  if (T.name in T.deps) throw new ArgumentError('Illegal dependency')
}

// ------------------------------------------------------------------------------------------------

function checkPresets (T) {
  if (!_hasOwnProperty(T, 'presets')) return

  const presets = T.presets
  if (!_basicObject(presets)) throw new ArgumentError('presets must be a basic object')

  for (const network of Object.keys(presets)) {
    const npresets = presets[network]
    if (!_basicObject(npresets)) throw new ArgumentError(`Presets for ${network} network must be an object`)

    // Check that either presets have all bindings or none at all
    const anyBindings = _BINDINGS.some(prop => _defined(npresets[prop]))
    const missingBinding = _BINDINGS.find(prop => !_defined(npresets[prop]))
    if (anyBindings && missingBinding) throw new ArgumentError(`${network} presets not fully defined: ${missingBinding} missing`)

    // Check that the preset bindings are valid if they exist
    if (anyBindings) {
      const loc = _location(npresets.location)
      if (!(loc._txid && (_defined(loc._vout) || _defined(loc._vdel)) && !_defined(loc._berry))) {
        throw new ArgumentError(`Bad location: ${_text(T)}`)
      }

      const orig = _location(npresets.origin)
      if (!(orig._txid && (_defined(orig._vout) || _defined(orig._vdel)) && !_defined(orig._berry))) {
        throw new ArgumentError(`Bad origin: ${_text(T)}`)
      }

      _nonce(npresets.nonce)
      _owner(npresets.owner, true)
      _satoshis(npresets.satoshis)

      if (npresets.nonce > 1 && npresets.origin === npresets.location) {
        throw new ArgumentError(`Bad nonce or location: ${_text(T)}`)
      }
    }

    // Check for reserved words in presets
    if ('deps' in npresets) throw new ArgumentError(`${network} presets must not contain deps`)
    if ('presets' in npresets) throw new ArgumentError(`${network} presets must not contain presets`)
    checkNoReservedWords(npresets)

    // Check for valid options in presets
    checkOptions(npresets)
  }
}

// ------------------------------------------------------------------------------------------------

function checkOptions (T) {
  if (_hasOwnProperty(T, 'sealed')) checkSealedOption(T.sealed)
  if (_hasOwnProperty(T, 'upgradable')) checkUpgradableOption(T.upgradable)
  if (_hasOwnProperty(T, 'interactive')) checkInteractiveOption(T.interactive)
}

// ------------------------------------------------------------------------------------------------

function checkSealedOption (value) {
  if (value !== true && value !== false && value !== 'owner') {
    throw new ArgumentError(`Invalid sealed option: ${value}`)
  }
}

// ------------------------------------------------------------------------------------------------

function checkUpgradableOption (value) {
  if (value !== true && value !== false) {
    throw new ArgumentError(`Invalid upgradable option: ${value}`)
  }
}

// ------------------------------------------------------------------------------------------------

function checkInteractiveOption (value) {
  if (value !== true && value !== false) {
    throw new ArgumentError(`Invalid interactive option: ${value}`)
  }
}

// ------------------------------------------------------------------------------------------------

function checkNoBindings (T) {
  const propNames = Object.getOwnPropertyNames(T)
  const badBinding = _BINDINGS.find(binding => propNames.includes(binding))
  if (badBinding) throw new ArgumentError(`Must not have any bindings: ${badBinding}`)
}

// ------------------------------------------------------------------------------------------------

function checkNoReservedWords (props) {
  const propNames = Object.getOwnPropertyNames(props)
  const badWord = _RESERVED_PROPS.find(word => propNames.includes(word)) ||
   _RESERVED_CODE_PROPS.find(word => propNames.includes(word))
  if (badWord) throw new ArgumentError(`Must not have any reserved words: ${badWord}`)
}

// ------------------------------------------------------------------------------------------------

function checkValidJigClass (T) {
  // Check for jig-specific reserved words
  const propNames = Object.getOwnPropertyNames(T.prototype)
  const badWord = _RESERVED_PROPS.find(word => propNames.includes(word)) ||
   _RESERVED_JIG_PROPS.find(word => propNames.includes(word)) ||
   _BINDINGS.find(word => propNames.includes(word))
  if (badWord) throw new ArgumentError(`Must not have any reserved jig words: ${badWord}`)

  // Check that the jig doesn't have a constructor. Force users to use init.
  const Jig = require('./jig')
  const childClasses = []
  let type = T
  while (type !== Jig) {
    childClasses.push(type)
    type = Object.getPrototypeOf(type)
  }
  const constructorRegex = /\s+constructor\s*\(/
  if (childClasses.some(type => constructorRegex.test(type.toString()))) {
    throw new Error('Jig must use init() instead of constructor()')
  }
}

// ------------------------------------------------------------------------------------------------

function checkValidBerryClass (T) {
  // Check for berry-specific reserved words
  const propNames = Object.getOwnPropertyNames(T.prototype)
  const badWord = _RESERVED_PROPS.find(word => propNames.includes(word)) ||
    _BINDINGS.find(word => propNames.includes(word))
  if (badWord) throw new ArgumentError(`Must not have any reserved berry words: ${badWord}`)

  // Check that the berry class doesn't have a constructor. Force users to use init.
  const Berry = require('./berry')
  const childClasses = []
  let type = T
  while (type !== Berry) {
    childClasses.push(type)
    type = Object.getPrototypeOf(type)
  }
  const constructorRegex = /\s+constructor\s*\(/
  if (childClasses.some(type => constructorRegex.test(type.toString()))) {
    throw new Error('Berry must use init() instead of constructor()')
  }
}

// ------------------------------------------------------------------------------------------------

function checkNoSymbolMethods (T) {
  _sudo(() => {
    if (Object.getOwnPropertySymbols(T).length ||
      Object.getOwnPropertySymbols(T.prototype).length) {
      throw new Error('Symbol methods not supported')
    }
  })
}

// ------------------------------------------------------------------------------------------------

function checkNoAccessors (T) {
  const check = desc => {
    if ('get' in desc || 'set' in desc) {
      throw new Error('Getters and setters not supported')
    }
  }

  _sudo(() => {
    Object.getOwnPropertyNames(T)
      .map(name => Object.getOwnPropertyDescriptor(T, name))
      .forEach(desc => check(desc))
    Object.getOwnPropertyNames(T.prototype)
      .map(name => Object.getOwnPropertyDescriptor(T.prototype, name))
      .forEach(desc => check(desc))
  })
}

// ------------------------------------------------------------------------------------------------

function checkUpgradable (T, editor) {
  // Only run these checks if we're upgrading
  if (!editor._installed) return

  // Disallow upgrading native code
  if (editor._native) throw new Error('Cannot upgrade native code')

  // Disallow upgrading to a jig
  const Code = require('./code')
  if (T instanceof Code) throw new ArgumentError('Cannot upgrade to a code jig')

  // Check no presets. Upgrading with presets is not supported.
  if (_hasOwnProperty(T, 'presets')) {
    const npresets = T.presets[editor._network]
    const checkNoPresets = x => {
      if (x in npresets) {
        throw new Error('Preset bindings not supported for upgrades')
      }
    }
    Bindings._BINDINGS.forEach(x => checkNoPresets(x))
  }

  // Undeployed code cannot be upgraded because there needs to be an output to spend
  const origin = _sudo(() => editor._C.origin)
  if (origin === Bindings._UNDEPLOYED_LOCATION) throw new Error('Cannot upgrade undeployed code')
}

// ------------------------------------------------------------------------------------------------

function makeSandbox (C, T, local = false, newCode = undefined) {
  // Check if T is an installable class or function
  checkType(T)
  checkUpgradable(T, EDITORS.get(C))

  // Create the parent first
  const Parent = _parent(T)
  const ParentCode = Parent && lookupOrCreateCode(Parent, local, newCode)
  if (ParentCode) {
    if (ParentCode.sealed === true) throw new ArgumentError(`${_text(ParentCode)} is sealed`)
    Editor._get(ParentCode)._postinstall()
  }

  // Check no duplicate parents
  const visited = new Set([C])
  let current = _parent(T)
  while (current) {
    if (visited.has(current)) throw new Error('Cannot extend the self')
    visited.add(C)
    current = _parent(current)
  }

  // Check properties
  checkDeps(T, ParentCode)
  checkPresets(T)
  checkOptions(T)
  checkNoBindings(T)

  // Create the sandbox type with no dependencies or properties except the parent
  const env = {}
  if (ParentCode) env[ParentCode.name] = ParentCode
  const native = false
  const anonymize = true
  const [S, SGlobal] = Sandbox._sandboxType(T, env, native, anonymize)

  // Since anonymized, add the name back in
  Object.defineProperty(S, 'name', { value: T.name, configurable: true })

  // Recreate deps in the sandbox
  const props = Object.assign({}, T)
  const makeCode = x => typeof x === 'function' ? lookupOrCreateCode(x, local, newCode) : undefined
  const Sprops = _deepClone(props, SI, makeCode)

  // Unify the props and deps
  _unifyForMethod(Sprops)

  // There must always be a deps property. Otherwise, user may be confused with parent deps.
  if (!('deps' in Sprops)) Sprops.deps = new SI.Object()

  // Add the implicit parent
  if (ParentCode) Sprops.deps[ParentCode.name] = ParentCode

  // Assign deps as globals
  Object.keys(Sprops.deps || {}).forEach(name => {
    const get = () => C.deps[name]
    const set = (value) => { C.deps[name] = value }
    Object.defineProperty(SGlobal, name, { get, set, configurable: true, enumerable: true })
  })

  // Add the proxy because we strip out the source code name
  _setOwnProperty(SGlobal, T.name, C)

  // Wrap deps to update globals. Always call target first because the proxy handles errors.
  Sprops.deps = makeDeps(C, SGlobal, Sprops.deps)

  // Assign props on sandbox
  Object.keys(Sprops).forEach(name => _setOwnProperty(S, name, Sprops[name]))

  // Create special caller property
  defineCaller(SGlobal)

  return [S, SGlobal]
}

// ------------------------------------------------------------------------------------------------

function makeDeps (C, SGlobal, deps) {
  // Wrap deps to update globals. Always call target first because the proxy handles errors.
  return new SI.Proxy(deps, {
    defineProperty: (target, prop, desc) => {
      const ret = Reflect.defineProperty(target, prop, desc)
      const get = () => C.deps[prop]
      const set = (value) => { C.deps[prop] = value }
      Object.defineProperty(SGlobal, prop, { get, set, configurable: true, enumerable: true })
      return ret
    },

    deleteProperty: (target, prop) => {
      const ret = Reflect.deleteProperty(target, prop)
      Reflect.deleteProperty(SGlobal, prop)
      if (prop === 'caller') defineCaller(SGlobal)
      return ret
    },

    set: (target, prop, value, receiver) => {
      // Safari doesn't like Reflect.set
      _setOwnProperty(target, prop, value)
      const ret = true
      const get = () => C.deps[prop]
      const set = (value) => { C.deps[prop] = value }
      Object.defineProperty(SGlobal, prop, { get, set, configurable: true, enumerable: true })
      return ret
    }
  })
}

// ------------------------------------------------------------------------------------------------

function defineCaller (SGlobal) {
  // If caller is already a global, don't override
  if ('caller' in SGlobal) return

  const Record = require('./record')

  // Define our special "caller" property that is accessible in all jigs.
  Object.defineProperty(SGlobal, 'caller', {
    get: () => Record._CURRENT_RECORD._caller(),
    set: () => { throw new Error('Cannot set caller') },
    configurable: true,
    enumerable: true
  })
}

// ------------------------------------------------------------------------------------------------

function addMembranesToPrototypeMethods (S, C) {
  const methods = Object.getOwnPropertyNames(S.prototype)
    .concat(Object.getOwnPropertySymbols(S.prototype))
    .filter(x => x !== 'constructor')

  methods.forEach(method => {
    const Membrane = require('./membrane')
    const methodRules = Rules._childProperty(C, true)
    S.prototype[method] = new Membrane(S.prototype[method], methodRules)
  })
}

// ------------------------------------------------------------------------------------------------

function hijackLocalInstanceof (T) {
  const Jig = require('./jig')
  const Berry = require('./berry')

  // For non-jigs and non-berries, hook up special code instanceof checks on the local.
  // Jigs and berries have their own hasInstance. Installed code has its own too.
  if (!_extendsFrom(T, Jig) && !_extendsFrom(T, Berry) && !_hasOwnProperty(T, Symbol.hasInstance)) {
    const desc = { configurable: true, enumerable: true, writable: false }
    const Code = require('./code')
    desc.value = Code.prototype[Symbol.hasInstance]
    Object.defineProperty(T, Symbol.hasInstance, desc)
  }
}

// ------------------------------------------------------------------------------------------------

function preinstall (T) {
  const prev = lookupCodeByType(T)
  if (prev) return prev
  const C = Editor._createCode()
  Editor._get(C)._preinstall(T)
  return C
}

// ------------------------------------------------------------------------------------------------
// Deploy helpers
// ------------------------------------------------------------------------------------------------

function deployMultiple (...jigs) {
  const Action = require('./action')
  const deploySet = new Set()

  // Find all inner jigs to deploy
  jigs.forEach(jig => {
    // Must only deploy non-native code
    const editor = EDITORS.get(jig)
    _assert(!editor._native)

    jig = lookupCodeByType(jig)
    const innerJigs = whatNeedsToBeDeployed(jig)
    innerJigs.forEach(jig => deploySet.add(jig))
  })

  // Check if there is anything to deploy
  if (!deploySet.size) return

  // Create the action
  Action._deploy([...deploySet])
}

// ------------------------------------------------------------------------------------------------

function whatNeedsToBeDeployed (creation, set = new Set()) {
  const Code = require('./code')
  _assert(creation instanceof Code)

  if (set.has(creation)) return

  // Finish installing so the creation has a location
  Editor._get(creation)._postinstall()

  // Check if we should add this creation to the set
  const location = _sudo(() => creation.location)
  const { _undeployed } = _location(location)
  if (!_undeployed) return set

  // Check if the parent needs to be deployed
  const Parent = _parent(creation)
  if (Parent) whatNeedsToBeDeployed(Parent, set)

  // Add the current creation
  set.add(creation)

  const props = _sudo(() => Object.assign({}, creation))

  // Check each inner property to find code to deploy
  const Creation = require('./creation')
  _sudo(() => _deepVisit(props, x => {
    if (x instanceof Code) whatNeedsToBeDeployed(x, set)
    if (x instanceof Creation) return false
    return true
  }))

  return set
}

// ------------------------------------------------------------------------------------------------
// Code Lookup
// ------------------------------------------------------------------------------------------------

function lookupCodeByType (T) {
  // If T is already code, return it
  if (EDITORS.has(T)) return T

  // If we've preinstalled T, return the origin
  if (PREINSTALLS.has(T)) return PREINSTALLS.get(T)

  // Find the repository for this network
  let network = ''
  try { network = _activeKernel()._blockchain.network } catch (e) { }
  const repository = REPOSITORY[network]
  if (!repository) return

  // Check if T is a local type with code already installed
  if (repository.has(T)) return repository.get(T)

  // If that didn't work, try finding C by its preset
  const presetLocation =
    _hasOwnProperty(T, 'presets') &&
    _hasOwnProperty(T.presets, network) &&
    T.presets[network].location
  if (!presetLocation) return

  for (const C of repository.values()) {
    if (_sudo(() => C.location) === presetLocation) return C
  }
}

// ------------------------------------------------------------------------------------------------

function lookupNativeCodeByName (name) {
  // Find the native code
  const C = NATIVE[name]
  if (!C) return undefined

  // Internal native code cannot be looked up. It must be known internally.
  if (EDITORS.get(C)._internal) throw new Error(`${name} is internal to RUN and cannot be deployed`)

  return C
}

// ------------------------------------------------------------------------------------------------
// Deactivate
// ------------------------------------------------------------------------------------------------

function deactivate () {
  let network = ''
  try { network = _activeKernel()._blockchain.network } catch (e) { }

  // Get the repository for the network being deactivated
  if (Log._infoOn) Log._info(TAG, 'Deactivate', network, 'bindings')

  if (!REPOSITORY[network]) return

  // Remove bindings from each local type
  function deactivateBindings (C, T) {
    // Don't remove bindings during coverage. Bindings will persist.
    if (Sandbox._cover.includes(T.name)) return

    _BINDINGS.forEach(name => { delete T[name] })

    delete T[Symbol.hasInstance]
  }

  // When local classes extends from Code classes, we still need to sudo
  _sudo(() => REPOSITORY[network].forEach(deactivateBindings))
}

// ------------------------------------------------------------------------------------------------
// Activate
// ------------------------------------------------------------------------------------------------

function activate () {
  let network = ''
  try { network = _activeKernel()._blockchain.network } catch (e) { }

  if (Log._infoOn) Log._info(TAG, 'Activate', network, 'bindings')

  // Finish install preinstalls. This is mainly needed for berries.
  Array.from(PREINSTALLS.values()).forEach(T => Editor._get(T)._postinstall())

  // Get the repository for the network being activated
  if (!REPOSITORY[network]) return

  // Set bindings for each local type from their presets
  function activateBindings (C, T) {
    const hasPresets = _hasOwnProperty(T, 'presets') && _hasOwnProperty(T.presets, network)

    if (hasPresets) {
      _BINDINGS.forEach(name => _setOwnProperty(T, name, T.presets[network][name]))
    } else {
      // Only clear bindings if we aren't in coverage, because otherwise we need them
      if (!Sandbox._cover.includes(T.name)) Bindings._markUndeployed(T)
    }

    hijackLocalInstanceof(T)
  }

  // When local classes extends from Code classes, we still need to sudo
  _sudo(() => REPOSITORY[network].forEach(activateBindings))
}

// ------------------------------------------------------------------------------------------------

Editor._createCode = createCode
Editor._lookupOrCreateCode = lookupOrCreateCode
Editor._upgradeCode = upgradeCode
Editor._lookupCodeByType = lookupCodeByType
Editor._lookupNativeCodeByName = lookupNativeCodeByName
Editor._deactivate = deactivate
Editor._activate = activate
Editor._makeSandbox = makeSandbox
Editor._makeDeps = makeDeps
Editor._preinstall = preinstall
Editor._get = T => EDITORS.get(T)
Editor._checkSealedOption = checkSealedOption
Editor._checkUpgradableOption = checkUpgradableOption
Editor._checkInteractiveOption = checkInteractiveOption
Editor._EDITORS = EDITORS

module.exports = Editor
