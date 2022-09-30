/**
 * execute.js
 *
 * Runs the actions in a program
 */

const Log = require('./log')
const Json = require('./json')
const Sandbox = require('./sandbox')
const { _assert, _setOwnProperty, _text, _extendsFrom } = require('./misc')
const Action = require('./action')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Execute'

// ------------------------------------------------------------------------------------------------
// _execute
// ------------------------------------------------------------------------------------------------

function _execute (op, data, masterList) {
  if (Log._debugOn) Log._debug(TAG, 'Executing', op, JSON.stringify(data))

  switch (op) {
    case 'DEPLOY': return _executeDeploy(data, masterList)
    case 'UPGRADE': return _executeUpgrade(data, masterList)
    case 'CALL': return _executeCall(data, masterList)
    case 'NEW': return _executeNew(data, masterList)
    default: throw new Error(`Unknown op: ${op}`)
  }
}

// ------------------------------------------------------------------------------------------------
// _executeDeploy
// ------------------------------------------------------------------------------------------------

function _executeDeploy (encdata, masterList) {
  const Editor = require('./editor')
  const Source = require('./source')

  _assert(encdata instanceof Array, 'DEPLOY data must be an array')
  _assert(encdata.length % 2 === 0, 'Invalid DEPLOY data length')

  // Create temporary code for each source
  const ncode = encdata.length / 2
  const code = []
  for (let i = 0; i < ncode; i++) code.push(Editor._createCode())

  // Create a special decoder that returns jigs in the newly created code before they are installed
  const decodeOptions = {
    _intrinsics: Sandbox._intrinsics,
    _decodeJig: (n) => {
      const jig = masterList[n] || code[n - masterList.length]
      if (!jig) throw new Error(`Invalid local jig reference: ${n}`)
      return jig
    }
  }

  const data = Json._decode(encdata, decodeOptions)

  // Install each code
  for (let i = 0; i < ncode; i++) {
    const src = data[i * 2 + 0]
    const props = data[i * 2 + 1]

    _assert(typeof src === 'string', 'DEPLOY src must be a string')
    _assert(typeof props === 'object' && !Array.isArray(props) && props, 'DEPLOY props must be an object')

    // Check that the source code is either a single class or function
    Source._check(src)

    // Create the local type from the source
    const [T] = Sandbox._evaluate(src, props.deps)

    _assert(typeof T === 'function', `DEPLOY src not supported: ${src}`)

    Object.keys(props).forEach(key => {
      _setOwnProperty(T, key, props[key])
    })

    // Create the sandbox
    const C = code[i]
    const local = false
    const [S] = Editor._makeSandbox(C, T, local)

    // Install the code into the sandbox
    const editor = Editor._get(C)
    editor._install(S, local, [], src)
  }

  // Deploy each code
  Action._deploy(code)
}

// ------------------------------------------------------------------------------------------------
// _executeUpgrade
// ------------------------------------------------------------------------------------------------

function _executeUpgrade (encdata, masterList) {
  const Code = require('./code')
  const Editor = require('./editor')
  const Source = require('./source')

  const decodeOptions = {
    _intrinsics: Sandbox._intrinsics,
    _decodeJig: (n) => masterList[n]
  }

  const data = Json._decode(encdata, decodeOptions)

  _assert(Array.isArray(data), 'UPGRADE data must be an array')
  _assert(data.length === 3, 'Invalid UPGRADE data length')
  _assert(data[0] instanceof Code, 'Must only upgrade code')
  _assert(typeof data[1] === 'string', 'UPGRADE src must be a string')
  _assert(typeof data[2] === 'object' && !Array.isArray(data[2]) && data[2], 'UPGRADE props must be an object')

  const [C, src, props] = data

  // Check that the source code is either a single class or function
  Source._check(src)

  // Create the source
  const [T] = Sandbox._evaluate(src, props.deps)
  Object.keys(props).forEach(key => {
    _setOwnProperty(T, key, props[key])
  })

  // Create the sandbox
  const [S] = Editor._makeSandbox(C, T)

  // Upgrade the code
  const local = false
  Editor._upgradeCode(C, S, local, src)
}

// ------------------------------------------------------------------------------------------------
// _executeCall
// ------------------------------------------------------------------------------------------------

function _executeCall (encdata, masterList) {
  const Code = require('./code')
  const Jig = require('./jig')

  const decodeOptions = {
    _intrinsics: Sandbox._intrinsics,
    _decodeJig: (n) => masterList[n]
  }

  const data = Json._decode(encdata, decodeOptions)

  _assert(data.length === 3, 'Invalid CALL data length')
  _assert((data[0] instanceof Code && (_extendsFrom(data[0], Jig) ||
    data[1] === 'auth' || data[1] === 'destroy')) ||
    data[0] instanceof Jig, 'Must only execute CALL on jigs or code')
  _assert(typeof data[1] === 'string', 'CALL method must be a string: ' + data[1])
  _assert(Array.isArray(data[2]), 'CALL args must be an array')
  _assert(data[0] instanceof Jig || data[1] !== 'upgrade', 'Cannot execute upgrade() with CALL')

  const [x, method, args] = data
  if (typeof x[method] !== 'function') throw new Error(`Cannot call ${_text(x)}.${method}()`)
  x[method](...args)
}

// ------------------------------------------------------------------------------------------------
// _executeNew
// ------------------------------------------------------------------------------------------------

function _executeNew (encdata, masterList) {
  const Code = require('./code')
  const Jig = require('./jig')

  const decodeOptions = {
    _intrinsics: Sandbox._intrinsics,
    _decodeJig: (n) => masterList[n]
  }

  const data = Json._decode(encdata, decodeOptions)

  _assert(data.length === 2, 'Invalid NEW data length')
  _assert(data[0] instanceof Code, 'Must only execute NEW on code')
  _assert(_extendsFrom(data[0], Jig), 'Must only execute NEW on a jig class')
  _assert(Array.isArray(data[1]), 'NEW args must be an array')

  const [C, args] = data

  new C(...args) // eslint-disable-line
}

// ------------------------------------------------------------------------------------------------

module.exports = _execute
