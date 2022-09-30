/**
 * berry.js
 *
 * Third-party protocol support through berries
 */

// ------------------------------------------------------------------------------------------------
// BerryDeps
// ------------------------------------------------------------------------------------------------

class BerryDeps {
  static get _Action () { return require('./action') }
  static get _Bindings () { return require('./bindings') }
  static get _Editor () { return require('./editor') }
  static get _load () { return require('./load') }
  static get _Membrane () { return require('./membrane') }
  static get _misc () { return require('./misc') }
  static get _NativeBerry () { return require('./berry') }
  static get _Record () { return require('./record') }
  static get _Rules () { return require('./rules') }
  static get _sudo () { return require('./admin')._sudo }
  static get _Transaction () { return require('./transaction') }
}

// ------------------------------------------------------------------------------------------------
// Berry
// ------------------------------------------------------------------------------------------------

class Berry {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  constructor (...args) {
    const Action = BerryDeps._Action
    const BERRIES = BerryDeps._misc._BERRIES
    const NativeBerry = BerryDeps._NativeBerry
    const Membrane = BerryDeps._Membrane
    const claimBerry = BerryDeps._load._claimBerry
    const Rules = BerryDeps._Rules
    const { _UNDEPLOYED_LOCATION } = BerryDeps._Bindings

    // Check that the berry class has been extended
    if (this.constructor === NativeBerry) throw new Error('Berry must be extended')

    // Claim the berry
    claimBerry(this.constructor)

    // Assign the location which comes from the load
    this.location = _UNDEPLOYED_LOCATION
    this.origin = _UNDEPLOYED_LOCATION
    this.nonce = 0
    this.owner = null
    this.satoshis = 0

    // Wrap ourselves in a proxy so that every action is tracked
    const initialized = false
    const rules = Rules._berryObject(initialized)
    const proxy = new Membrane(this, rules)

    // Add ourselves to the list of berries
    BERRIES.add(proxy)

    // Create the new action in the record, which will also call init()
    rules._immutable = false
    Action._pluck(this.constructor, proxy, args)
    rules._immutable = true

    // Return the proxy
    return proxy
  }

  // --------------------------------------------------------------------------
  // hasInstance
  // --------------------------------------------------------------------------

  static [Symbol.hasInstance] (x) {
    // Prevent users from creating "berries" via Object.setPrototypeOf. This also solves
    // the issues of Dragon.prototype instanceof Dragon returning true.
    if (!BerryDeps._misc._BERRIES.has(x)) return false

    // If we aren't checking a particular class, we are done
    if (this === BerryDeps._NativeBerry) return true

    // Get the sandboxed version of the class
    const C = BerryDeps._Editor._lookupCodeByType(this)

    // If didn't find this code, then it couldn't be an instance.
    if (!C) return false

    // Check if the berry class matches
    return BerryDeps._sudo(() => {
      let type = Object.getPrototypeOf(x)
      while (type) {
        if (type.constructor.location === C.location) return true
        type = Object.getPrototypeOf(type)
      }

      return false
    })
  }

  // --------------------------------------------------------------------------
  // pluck
  // --------------------------------------------------------------------------

  static async pluck (location, fetch, pluck) {
    return new this()
  }

  // --------------------------------------------------------------------------

  static load (location) {
    const { _activeKernel, _text, _extendsFrom } = BerryDeps._misc
    const _load = BerryDeps._load
    const NativeBerry = BerryDeps._NativeBerry
    const Record = BerryDeps._Record
    const CURRENT_RECORD = Record._CURRENT_RECORD
    const Transaction = BerryDeps._Transaction

    if (Transaction._ATOMICALLY_UPDATING) throw new Error('load disabled during atomic update')

    // load cannot be applied to a non-berry class
    if (this !== NativeBerry && !_extendsFrom(this, NativeBerry)) throw new Error('load unavailable')

    // load only available outside jigs
    if (CURRENT_RECORD._stack.length) throw new Error('load cannot be called internally')

    const kernel = _activeKernel()
    const B = this === NativeBerry ? undefined : this
    const promise = _load(location, B, kernel)

    const loadAsync = async () => {
      const berry = await promise
      if (berry instanceof this) return berry
      throw new Error(`Cannot load ${location}\n\n${_text(berry)} not an instance of ${_text(this)}`)
    }

    return loadAsync()
  }

  // --------------------------------------------------------------------------
  // init
  // --------------------------------------------------------------------------

  init (...args) { }
}

Berry.deps = { BerryDeps }
Berry.sealed = false

// ------------------------------------------------------------------------------------------------

Berry.toString() // Preserves the class name during compilation

const NativeBerry = BerryDeps._Editor._createCode()
const editor = BerryDeps._Editor._get(NativeBerry)
const internal = false
editor._installNative(Berry, internal)

module.exports = NativeBerry
