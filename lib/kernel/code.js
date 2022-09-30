/**
 * code.js
 *
 * User-facing Code object that can also be referenced in jigs
 */

// ------------------------------------------------------------------------------------------------
// CodeDeps
// ------------------------------------------------------------------------------------------------

class CodeDeps {
  static get _Action () { return require('./action') }
  static get _Editor () { return require('./editor') }
  static get _Log () { return require('./log') }
  static get _misc () { return require('./misc') }
  static get _Record () { return require('./record') }
  static get _sudo () { return require('./admin')._sudo }
  static get _sync () { return require('./sync') }
  static get _TAG () { return 'Code' }
  static get _Transaction () { return require('./transaction') }
}

// ------------------------------------------------------------------------------------------------
// NativeCode
// ------------------------------------------------------------------------------------------------

/**
 * Code is to a code jig as Function is to a standard class
 *
 * Unlike Function, Code instances will not extend from this prototype but their methods will
 * be made available via the membrane and instanceof checks will pass.
 */
class Code {
  constructor () {
    throw new Error('Cannot instantiate Code')
  }

  // --------------------------------------------------------------------------

  /**
   * Gets the source code
   */
  toString () {
    const Editor = CodeDeps._Editor
    const _sudo = CodeDeps._sudo
    const { _assert } = CodeDeps._misc

    // Non-code children have their source code calculated intact
    const editor = Editor._get(this)
    if (!editor) return _sudo(() => this.toString())

    // Get the source code
    const D = editor._D
    const src = editor._src
    _assert(src)

    // If non-native, return the source code directly
    if (!editor._native) return src

    // Otherwise, modify the source code to be clearly native code
    if (src.startsWith('class')) {
      return `class ${D.name} { [native code] }`
    } else {
      return `function ${D.name}() { [native code] }`
    }
  }

  // --------------------------------------------------------------------------

  /**
   * Updates the code to its latest state
   *
   * @param {?object} options
   * @param {boolean} options.forward Whether to forward sync or just wait for pending updates. Default true.
   * @param {boolean} options.inner Whether to forward sync inner jigs if forward syncing. Default true.
   */
  sync (options = {}) {
    const Editor = CodeDeps._Editor
    const Log = CodeDeps._Log
    const _sync = CodeDeps._sync
    const TAG = CodeDeps._TAG
    const { _text } = CodeDeps._misc
    const Transaction = CodeDeps._Transaction
    const Record = CodeDeps._Record
    const CURRENT_RECORD = Record._CURRENT_RECORD

    if (Log._debugOn) Log._debug(TAG, 'Sync', _text(this))

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('sync disabled during atomic update')

    // sync only available outside the jig
    if (CURRENT_RECORD._stack.length) throw new Error('sync cannot be called internally')

    // Can't sync a non-code child class
    const editor = Editor._get(this)
    if (!editor) throw new Error('sync unavailable')

    // Nothing to sync if native. Not an error.
    if (editor._native) return

    // Sync it. Return self for chaining
    return _sync(this, options).then(() => this)
  }

  // --------------------------------------------------------------------------

  upgrade (T) {
    const Editor = CodeDeps._Editor
    Editor._upgradeCode(this, T)

    // Return self for chaining
    return this
  }

  // --------------------------------------------------------------------------

  auth () {
    const Action = CodeDeps._Action
    const Editor = CodeDeps._Editor
    const { _text } = CodeDeps._misc
    const Record = CodeDeps._Record
    const Log = CodeDeps._Log
    const TAG = CodeDeps._TAG

    if (Log._debugOn) Log._debug(TAG, 'Auth', _text(this))

    // Non-jig child classes and native code cannot be signed. Errors.
    const editor = Editor._get(this)
    if (!editor) throw new Error('auth unavailable on non-jigs')
    if (editor._native) throw new Error('auth unavailable on native jigs')

    // We cannot auth code just created because there is no input
    if (Record._CURRENT_RECORD._creates._has(this)) throw new Error('auth unavailable on new jigs')

    // Record an auth action
    Action._auth(this)

    // Return self for chaining
    return this
  }

  // --------------------------------------------------------------------------

  destroy () {
    const Action = CodeDeps._Action
    const Editor = CodeDeps._Editor
    const Log = CodeDeps._Log
    const { _text } = CodeDeps._misc
    const TAG = CodeDeps._TAG

    if (Log._debugOn) Log._debug(TAG, 'Destroy', _text(this))

    // Non-jig child classes and native code cannot be destroyed. Errors.
    const editor = Editor._get(this)
    if (!editor || editor._native) throw new Error('destroy unavailable')

    // Record a destroy action
    Action._destroy(this)

    // Return self for chaining
    return this
  }

  // --------------------------------------------------------------------------

  [Symbol.hasInstance] (x) {
    const Editor = CodeDeps._Editor
    const _sudo = CodeDeps._sudo

    // If x is not an object, then nothing to check
    if (typeof x !== 'object' || !x) return false

    // Get the sandboxed version of the class
    const C = Editor._lookupCodeByType(this)

    // If didn't find this code, then it couldn't be an instance.
    if (!C) return false

    // Check if this class's prototype is in the prototype chain of the instance
    // We only check origins, not locations, because (1) locations change frequently
    // for certain class jigs, and to users syncing would be annoying, and (2) inside
    // jig code there will only ever be one location for a jig class at a time.
    return _sudo(() => {
      let type = Object.getPrototypeOf(x)
      while (type) {
        if (type.constructor.origin && type.constructor.origin === C.origin) return true
        type = Object.getPrototypeOf(type)
      }

      return false
    })
  }

  // --------------------------------------------------------------------------

  static [Symbol.hasInstance] (x) {
    return CodeDeps._misc._CODE.has(x)
  }
}

Code.deps = { CodeDeps }
Code.sealed = true

// ------------------------------------------------------------------------------------------------

Code.toString() // Preserves the class name during compilation

const NativeCode = CodeDeps._Editor._createCode()
const editor = CodeDeps._Editor._get(NativeCode)
const internal = false
editor._installNative(Code, internal)

// ------------------------------------------------------------------------------------------------

module.exports = NativeCode
