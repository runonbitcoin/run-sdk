/**
 * creation.js
 *
 * Common base for jigs, sidekicks, and berries
 */

// ------------------------------------------------------------------------------------------------
// CreationDeps
// ------------------------------------------------------------------------------------------------

class CreationDeps {
  static get _Editor () { return require('./editor') }
  static get _misc () { return require('./misc') }
}

// ------------------------------------------------------------------------------------------------
// Creation
// ------------------------------------------------------------------------------------------------

/**
 * A JavaScript asset that can be loaded by Run. There are three kinds:
 *
 *      - Jigs (code and objects)
 *      - Sidekicks (code)
 *      - Berries (objects)
 *
 * All creations have bindings - location, origin, nonce, owner, and satoshis. These bindings may
 * or may not all be used, but they are required. The location, origin, and nonce are the
 * "Location Bindings". The owner and satoshis are the "UTXO Bindings". When a creation does not
 * have a UTXO, whether because of it being destroyed, or because it is a berry and never had one,
 * owner should be null and satoshis should be 0.
 *
 * Creations can be referenced by other creations. They have membranes that track their actions
 * and enforce their rules.
 */
class Creation {
  static [Symbol.hasInstance] (x) {
    const { _JIGS, _CODE, _BERRIES } = CreationDeps._misc
    if (_JIGS.has(x)) return true
    if (_CODE.has(x)) return true
    if (_BERRIES.has(x)) return true
    return false
  }
}

Creation.deps = { CreationDeps }
Creation.sealed = true

// ------------------------------------------------------------------------------------------------

Creation.toString() // Preserves the class name during compilation

const NativeCreation = CreationDeps._Editor._createCode()
const editor = CreationDeps._Editor._get(NativeCreation)
const internal = false
editor._installNative(Creation, internal)

module.exports = NativeCreation
