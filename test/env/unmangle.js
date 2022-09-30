/**
 * unmangle.js
 *
 * Wraps an object to remove property name mangling. We use this to test minified builds.
 */

let mangledProps = {}
try { mangledProps = require('../../dist/name-cache.json').props.props } catch (e) { }

// ------------------------------------------------------------------------------------------------
// enable
// ------------------------------------------------------------------------------------------------

let mangled = false
function enable (enable) { mangled = enable }

// ------------------------------------------------------------------------------------------------
// unmangle
// ------------------------------------------------------------------------------------------------

/**
 * Wraps an object so that its immediate properties are able to be accessed unmangled
 */
function unmangle (x) {
  if (!mangled) return x

  return new Proxy(x, {
    deleteProperty: (target, prop) => {
      if (('$' + prop) in mangledProps) prop = mangledProps['$' + prop]
      delete target[prop]
      return true
    },

    get: (target, prop) => {
      if (typeof prop !== 'string') return target[prop]
      if (prop in target) return target[prop]
      if (('$' + prop) in mangledProps) return target[mangledProps['$' + prop]]
    },

    set: (target, prop, value) => {
      if (('$' + prop) in mangledProps) prop = mangledProps['$' + prop]
      target[prop] = value
      return true
    }
  })
}

// ------------------------------------------------------------------------------------------------
// mangle
// ------------------------------------------------------------------------------------------------

/**
 * Transforms an object so that every key is mangled to be used within Run
 */
function mangle (x) {
  if (!mangled) return x

  Object.keys(x).forEach(key => {
    const mangledKey = '$' + key
    if (mangledKey in mangledProps) {
      x[mangledProps[mangledKey]] = x[key]
      delete x[key]
    }
  })

  return x
}

// ------------------------------------------------------------------------------------------------

unmangle.enable = enable
unmangle.mangle = mangle

module.exports = unmangle
