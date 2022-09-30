/**
 * unify.js
 *
 * Unify: make jigs that interact together all use the same jigs in their latest common states
 *
 * Unifification happens automatically. When a user calls a method:
 *
 *    a.f(b, c)
 *
 * then a, b, c, and also all their inner references, are unified. Similar for deploy and upgrade.
 *
 * We unify so that within a method, distinct jigs are distinct, and same jigs are same,
 * and there is a consistent worldview of jigs at locations, so that when users say is x === y,
 * they get consistent answers that make sense, and over time inner references are updated.
 *
 * However...
 *
 * The state of a jig is just its own properties. It may include references to other jigs,
 * but whatever is in those other jigs are not part of the base jig state. Why does it matter?
 *
 * Because when jigs are unified for a method, the *indirect jigs*, those jigs that are
 * references of references, are unified too. But when they are not part of any jig being
 * updated, those indirect jigs mustn't stay unified after the method is complete. They
 * must revert to their former state as it was referenced by the jigs before the method.
 *
 * This process, called de-unification, is used during replays. It's not crucial for user
 * method calls though. Also, during replays, we only unify the inputs and refs once during load.
 * We don't have to unify every action if we know they were all unified at the beginning.
 */

const { _text, _assert, _hasOwnProperty } = require('./misc')
const { _deepVisit, _deepReplace } = require('./deep')
const { _sudo } = require('./admin')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

// Unificatoin for method gets disabled during replay because we unify ahead of time
let UNIFY_FOR_METHOD_ENABLED = true

// ------------------------------------------------------------------------------------------------
// _unifyForReplay
// ------------------------------------------------------------------------------------------------

function _unifyForReplay (inputs, refs, jigToSync) {
  return _sudo(() => {
    // All incoming jigs must have unique origins
    const incoming = inputs.concat(refs)
    const incomingByOrigin = {}
    incoming.forEach(x => {
      const y = incomingByOrigin[x.origin]
      if (y) {
        const line1 = `1st location: ${x.location}`
        const line2 = `2nd location: ${y.location}`
        const error = `Inconsistent reference: ${_text(x)}\n\n${line1}\n${line2}`
        throw new Error(error)
      }
      incomingByOrigin[x.origin] = x
    })

    const worldview = { }
    const allJigs = new Set()
    const deunifyMap = new Map()

    // Add all incoming jigs to the worldview first
    incoming.forEach(x => { worldview[x.origin] = x })

    // Calculate the latest versions of every referenced jig
    const Creation = require('./creation')
    _sudo(() => _deepVisit(incoming, x => {
      if (x instanceof Creation) {
        allJigs.add(x)
        const xOrigin = x.origin
        const incomingY = incomingByOrigin[xOrigin]
        if (incomingY && x.nonce > incomingY.nonce) {
          const line1 = `1st location: ${x.location}`
          const line2 = `2nd location: ${incomingY.location}`
          throw new Error(`Time travel: ${_text(x)}\n\n${line1}\n${line2}`)
        }
        const y = worldview[xOrigin]
        if (!y || x.nonce > y.nonce) worldview[xOrigin] = x
      }
    }))

    // Override the worldview so that all inner refs use the jig to sync
    if (jigToSync) worldview[jigToSync.origin] = jigToSync

    // Unify the jig to sync with the worldview, potentially reversing inner syncs
    _deepReplace(jigToSync, (x, recurse) => {
      if (x !== jigToSync && x instanceof Creation) {
        recurse(false)
        return worldview[x.origin]
      }
    })

    // Now update the jigs of all other references. Do so shallowly to track jigs for deunification.
    for (const jig of allJigs) {
      const refs = new Map()
      _deepReplace(jig, (x, recurse) => {
        if (x !== jig && x instanceof Creation) {
          const y = worldview[x.origin]
          if (x !== y) refs.set(y, x)
          _assert(y)
          recurse(false)
          return y
        }
      })
      if (!inputs.includes(jig)) deunifyMap.set(jig, refs)
    }

    // Build a refmap from the worldview which we will use to save state later
    const refmap = {}
    Object.entries(worldview).forEach(([origin, jig]) => {
      refmap[origin] = [jig.location, jig.nonce]
    })

    return { _refmap: refmap, _deunifyMap: deunifyMap }
  })
}

// ------------------------------------------------------------------------------------------------
// _deunifyForReplay
// ------------------------------------------------------------------------------------------------

function _deunifyForReplay (deunifyMap) {
  _sudo(() => {
    for (const [jig, value] of deunifyMap.entries()) {
      const Creation = require('./creation')
      _deepReplace(jig, (x, recurse) => {
        if (x !== jig && x instanceof Creation) {
          recurse(false)
          return value.get(x) || x
        }
      })
    }
  })
}

// ------------------------------------------------------------------------------------------------
// _unifyForMethod
// ------------------------------------------------------------------------------------------------

function _unifyForMethod (obj, fixed = []) {
  const Creation = require('./creation')

  if (!UNIFY_FOR_METHOD_ENABLED) return

  const getKey = x => _sudo(() => {
    if (!_hasOwnProperty(x, 'origin') || x.origin.startsWith('error://')) return x
    return x.origin
  })

  return _sudo(() => {
    const worldview = new Map() // Origin | Jig -> Creation

    // Add fixed jigs so they don't get replaced
    fixed.forEach(jig => {
      _assert(jig instanceof Creation)
      const xkey = getKey(jig)
      const consistent = !worldview.has(xkey) || worldview.get(xkey).nonce === jig.nonce
      if (!consistent) {
        const details = _sudo(() => `There are conflicting jigs for ${jig.origin}, nonces ${worldview.get(xkey).nonce}, ${jig.nonce}`)
        throw new Error(`Cannot unify inconsistent ${_text(jig)}\n\n${details}`)
      }
      worldview.set(xkey, jig)
    })

    // Find the most recent versions of every inner jig
    _sudo(() => _deepVisit(obj, x => {
      if (x instanceof Creation) {
        const xkey = getKey(x)
        const y = worldview.get(xkey) || x
        if (!worldview.has(xkey)) worldview.set(xkey, x)

        if (x.nonce > y.nonce) {
          if (fixed.includes(y)) {
            const line1 = `1st location: ${x.location}`
            const line2 = `2nd location: ${y.location}`
            throw new Error(`Cannot unify inconsistent ${_text(x)}\n\n${line1}\n${line2}`)
          }

          worldview.set(xkey, x)
        }
      }
    }))

    return _deepReplace(obj, x => {
      if (x instanceof Creation) {
        return worldview.get(getKey(x))
      }
    })
  })
}

// ------------------------------------------------------------------------------------------------

function _setUnifyForMethodEnabled (enabled) {
  UNIFY_FOR_METHOD_ENABLED = enabled
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _unifyForReplay,
  _deunifyForReplay,
  _unifyForMethod,
  _setUnifyForMethodEnabled
}
