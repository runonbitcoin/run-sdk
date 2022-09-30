/**
 * sandbox.js
 *
 * The universal code sandbox used within Run.
 *
 * All third-party code that Run loads uses this sandbox. The Sandbox class is a singleton. We
 * use a single sandbox so that even if we load objects from multiple Run instances, they all
 * come from the same "realm" and share the same intrinsics. This is important! Because any
 * internal Run logic that depends on the intrinsics (ie. "instanceof Uint8Array") can now
 * assume the intrinsics will all come from the same realm. Anything else would be a nightmare.
 */

const DeterministicRealm = require('./realm')
const { _defineGetter } = require('./misc')
const Source = require('./source')
const Log = require('./log')

// ------------------------------------------------------------------------------------------------
// Sandbox
// ------------------------------------------------------------------------------------------------

const TAG = 'Sandbox'

/**
 * The universal code sandbox
 */
class Sandbox {
  constructor () {
    this._cover = []

    if (Log._debugOn) Log._debug(TAG, 'Creating deterministic realm')

    this._realm = new DeterministicRealm()
    this._sandboxes = new WeakSet()

    // Keep track of common intrinsics shared between realms. The SES realm creates
    // these, and we just evaluate a list of them and store them here.
    const compartment = this._realm.makeCompartment()
    this._intrinsics = compartment.evaluate(_getIntrinsicsSrc)
    this._hostIntrinsics = eval(_getIntrinsicsSrc) // eslint-disable-line

    this._intrinsicSet = new Set(Object.entries(this._intrinsics).map(([x, y]) => y))
    this._hostIntrinsicSet = new Set(Object.entries(this._hostIntrinsics).map(([x, y]) => y))
  }

  _sandboxType (T, env, native = false, anonymize = false) {
    let originalSource = T.toString()

    // If we're in cover, we have to specially handle our evals
    const cover = process.env.COVER && (native || this._cover.includes(T.name))
    if (cover) {
      const sandboxed = this._sandboxes.has(T)

      // If we're in the global realm, just leave intact so we collect coverage
      if (!sandboxed) {
        const globalThis = typeof global !== 'undefined' ? global : window
        return [T, globalThis]
      }

      // Strip coverage from the source code
      originalSource = Source._uncover(originalSource)
    }

    // Create the source code
    const src = Source._sandbox(originalSource, T)
    const src2 = anonymize ? Source._anonymize(src) : src

    // Evaluate the source code
    return this._evaluate(src2, env)
  }

  _evaluate (src, env = {}) {
    const compartment = this._realm.makeCompartment()

    Object.assign(compartment.global, this._intrinsics, env)

    // When a function is anonymous, it will be named the variable it is assigned. We give it
    // a friendly anonymous name to distinguish it from named classes and functions.
    const anon = src.startsWith('class') ? 'AnonymousClass' : 'anonymousFunction'
    const script = `const ${anon}=${src};${anon}`

    // Show a nice error when we try to access Date and Math

    if (!('Math' in env)) {
      _defineGetter(compartment.global, 'Math', () => {
        const hint = 'Hint: Math is disabled because it is non-deterministic.'
        throw new ReferenceError(`Math is not defined\n\n${hint}`)
      })
    }

    if (!('Date' in env)) {
      _defineGetter(compartment.global, 'Date', () => {
        const hint = 'Hint: Date is disabled because it is non-deterministic.'
        throw new ReferenceError(`Date is not defined\n\n${hint}`)
      })
    }

    const result = compartment.evaluate(script)

    if (typeof result === 'function') this._sandboxes.add(result)

    return [result, compartment.global]
  }
}

// ------------------------------------------------------------------------------------------------
// Intrinsics
// ------------------------------------------------------------------------------------------------

// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects
const _intrinsicNames = [
  // Global functions
  'console', 'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'decodeURI',
  'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
  // Fundamental objects
  'Object', 'Function', 'Boolean', 'Symbol', 'Error', 'EvalError', 'RangeError',
  'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
  // Numbers and dates
  'Number', 'BigInt', 'Math', 'Date',
  // Text processing
  'String', 'RegExp',
  // Indexed collections
  'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array',
  'BigUint64Array',
  // Keyed collections
  'Map', 'Set', 'WeakMap', 'WeakSet',
  // Structured data
  'ArrayBuffer', 'DataView', 'JSON',
  // Control abstraction objects
  'Promise', 'Generator', 'GeneratorFunction', 'AsyncFunction',
  // Reflection
  'Reflect', 'Proxy',
  // Internationalization
  'Intl',
  // WebAssembly
  'WebAssembly'
]

let _getIntrinsicsSrc = 'const x = {}\n'
_intrinsicNames.forEach(name => {
  _getIntrinsicsSrc += `x.${name} = typeof ${name} !== 'undefined' ? ${name} : undefined\n`
})
_getIntrinsicsSrc += 'x'

// ------------------------------------------------------------------------------------------------

module.exports = new Sandbox()
