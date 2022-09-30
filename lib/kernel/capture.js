/**
 * capture.js
 *
 * Captures jig and berry state for the cache
 */

const Log = require('./log')
const { _assert, _text, _defined } = require('./misc')
const { _location } = require('./bindings')
const { _sudo } = require('./admin')
const { _getStateVersion } = require('./version')
const Json = require('./json')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Capture'

// ------------------------------------------------------------------------------------------------
// _captureJig
// ------------------------------------------------------------------------------------------------

async function _captureJig (jig, commit, outputIndices, deleteIndices, timeout) {
  if (Log._debugOn) Log._debug(TAG, 'Capture', _text(jig))

  const record = commit._record

  const after = commit._after.get(jig)
  _assert(after)

  // Load the previous state's references to use when we don't spend
  const refmap = await commit._buildRefmap(timeout)
  timeout._check()

  const encodeOptions = {
    _encodeJig: (x) => {
      const vout = outputIndices.get(x)
      if (_defined(vout)) return `_o${commit._base.outputs.length + 1 + vout}`

      const vdel = deleteIndices.get(x)
      if (_defined(vdel)) return `_d${vdel}`

      const ref = record._refs._get(x)
      if (ref) return record._before.get(ref)._props.location

      const origin = _sudo(() => x.origin)
      if (origin.startsWith('native://')) return origin

      const beforeRefLocation = refmap[origin] && refmap[origin][0]
      _assert(beforeRefLocation)
      return beforeRefLocation
    }
  }

  // Create the state, which is order-independent
  const state = {}

  // cls
  if (after._cls) state.cls = Json._encode(after._cls, encodeOptions)

  // kind
  state.kind = after._kind

  // props
  const props = Object.assign({}, after._props)
  const vout = outputIndices.get(jig)
  const vdel = deleteIndices.get(jig)
  const localLocation = _defined(vout) ? `_o${commit._base.outputs.length + 1 + vout}` : `_d${vdel}`
  props.location = localLocation
  _assert(!props.origin.startsWith('record://') || props.origin.startsWith(`record://${record._id}`))
  if (props.origin.startsWith(`record://${record._id}`)) props.origin = localLocation
  state.props = Json._encode(props, encodeOptions)

  // src
  if (after._src) state.src = after._src

  // version
  state.version = _getStateVersion(commit._version)

  return state
}

// ------------------------------------------------------------------------------------------------
// _captureBerry
// ------------------------------------------------------------------------------------------------

function _captureBerry (berry, version) {
  // The encoder assumes all referenced jigs are fixed in location and deployed
  const encodeOptions = {
    _encodeJig: (x) => {
      const xLocation = _sudo(() => x.location)
      const loc = _location(xLocation)
      _assert(_defined(loc._txid) && !_defined(loc._record) && !_defined(loc._error))
      return xLocation
    }
  }

  // Create the state, which is order-independent
  const state = {}

  // cls
  state.cls = Json._encode(berry.constructor, encodeOptions)

  // kind
  state.kind = 'berry'

  // props
  const props = _sudo(() => Object.assign({}, berry))
  state.props = Json._encode(props, encodeOptions)

  // version
  state.version = _getStateVersion(version)

  return state
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _captureJig,
  _captureBerry
}
