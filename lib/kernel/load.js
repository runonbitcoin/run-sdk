/**
 * load.js
 *
 * Loads a creation and all its dependencies in parallel
 */

const bsv = require('bsv')
const { Transaction } = bsv
const Log = require('./log')
const { _assert, _extendsFrom, _text, _Timeout, _defined } = require('./misc')
const { _deterministicJSONStringify } = require('./determinism')
const { _location, _compileLocation, _UNDEPLOYED_LOCATION } = require('./bindings')
const { _sudo } = require('./admin')
const Sandbox = require('./sandbox')
const { ArgumentError, ClientModeError, TrustError } = require('./error')
const { _PROTOCOL_VERSION } = require('./version')
const { _sha256 } = require('./bsv')
const { _extractMetadata } = require('./metadata')
const { ExecutionError } = require('./error')
const Code = require('./code')
const Editor = require('./editor')
const SI = Sandbox._intrinsics
const HI = Sandbox._hostIntrinsics

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Load'

// We try not to duplicate replays. Even if we can't re-use their jigs, it's better for one replay
// to wait for the other so that the cache is hydrated. Because replaying is very expensive.
const ALL_REPLAYS = new Map() // txid -> Promise

// Berry classes being plucked, to make sure we are plucking correctly, as a safety check.
let UNCLAIMED_BERRIES = []

// Berry loading errors - any errors fail all because with async we can't distinguish
let PLUCK_COUNT = 0
let PLUCK_ERROR = null

// ------------------------------------------------------------------------------------------------
// Session
// ------------------------------------------------------------------------------------------------

/**
 * Notes
 *  - A load session *may* dedup jigs that are loaded in parallel.
 *  - Replays of any kind (jigs, berry plucks) use different sessions for safety.
 *  - There may be duplicate inner jigs created when replaying. These are still safe to use.
 *  - State cache jigs are loaded in two phases. Completers store a promise for the second phase.
 */
class Session {
  constructor () {
    // Promises for the individual loads in progress
    this._loads = new Map() // Location -> Promise<Jig>

    // Promises for replays in progress
    this._replays = new Map() // Txid -> Promise<Commit>

    // Promises to complete any partial loads
    this._completers = []
  }
}

// ------------------------------------------------------------------------------------------------
// _load
// ------------------------------------------------------------------------------------------------

/**
 * Loads a jig or berry at a location
 *
 * BerryClass forces the berry to be plucked using that class, whether deployed or not.
 */
async function load (location, BerryClass, kernel, session, timeout, complete = true) {
  _assert(kernel)
  session = session || new Session()
  timeout = timeout || new _Timeout('load', kernel._timeout, location)

  try {
    timeout._check()

    // Piggy back on an existing load if there is one.
    // Except when there's a berry class. The location is not the real location in that case.
    if (!BerryClass) {
      const prev = session._loads.get(location)
      if (prev) return prev
    }

    // Start a new load. This may partially load the jig and create a completer.
    const promise = _loadFresh(location, BerryClass, kernel, session, timeout)

    // Save the promise so future loads won't load the same jig twice
    // Except when there's a berry class. Same reason as above.
    if (!BerryClass) {
      session._loads.set(location, promise)
    }

    // Wait for the load to finish
    const jig = await promise

    // If we are returning a complete load to the user, finish all inner loads.
    // Completers might create more completers so we loop.
    if (complete) {
      while (session._completers.length) {
        const completers = session._completers
        session._completers = []
        await Promise.all(completers)
      }
    }

    return jig
  } catch (e) {
    if (PLUCK_COUNT) PLUCK_ERROR = PLUCK_ERROR || e
    throw e
  }
}

// ------------------------------------------------------------------------------------------------
// _loadFresh
// ------------------------------------------------------------------------------------------------

/**
 * Loads a jig assuming it is not already being loaded
 */
async function _loadFresh (location, BerryClass, kernel, session, timeout) {
  timeout._check()

  if (BerryClass) {
    if (Log._infoOn) Log._info(TAG, 'Load', location, 'with', _text(BerryClass))
  } else {
    if (Log._infoOn) Log._info(TAG, 'Load', location)
  }

  const start = new Date()

  try {
    // If the user specified a berry class, use it to load the location
    if (BerryClass) {
      return await _loadWithUserBerryClass(location, BerryClass, kernel, session, timeout)
    }

    // Parse the location
    const loc = _location(location)

    // Check that the location is not an error or unpublished
    if (_defined(loc._error) || _defined(loc._record)) {
      throw new ArgumentError(`Bad location: ${location}`)
    }

    // If the location is native, get and return it right away
    if (_defined(loc._native)) {
      return _loadNative(location, timeout)
    }

    // If non-native, check that we can load it
    if (!loc._txid) throw new ArgumentError(`Bad location: ${location}`)

    // Load the jig, code, or berry from its location
    if (_defined(loc._berry)) {
      return await _loadBerryFromLocation(location, kernel, session, timeout)
    } else {
      return await _loadJigFromLocation(location, kernel, session, timeout)
    }
  } finally {
    if (Log._debugOn) Log._debug(TAG, 'Load (end): ' + (new Date() - start) + 'ms')
  }
}

// ------------------------------------------------------------------------------------------------
// _loadBerryFromLocation
// ------------------------------------------------------------------------------------------------

async function _loadBerryFromLocation (location, kernel, session, timeout) {
  const loadFunction = async () => {
    timeout._check()

    // Parse the location to determine if it is a full location
    const loc = _location(location)
    const classLocation = loc._txid + (_defined(loc._vout) ? `_o${loc._vout}` : `'_d${loc._vdel}`)
    const berry = loc._berry
    const hash = loc._hash
    const version = loc._version || _PROTOCOL_VERSION

    // Try loading from the cache first
    const partialLocation = _compileLocation({
      _txid: loc._txid,
      _vdel: loc._vdel,
      _vout: loc._vout,
      _berry: berry,
      _version: version
    })

    // Get the state from the cache if it exists
    const key = `${location.includes('?') ? 'berry' : 'jig'}://${partialLocation}`
    const options = { all: true, tx: !kernel._trustlist.has('state') }
    const state = kernel._state && await kernel._state.pull(key, options)

    if (state) {
      // Recreate the berry from the cached state
      const _recreate = require('./recreate')
      const partial = await _recreate(location, state, hash, kernel, session, timeout)
      session._completers.push(partial._completer)
      return partial._value
    } else {
      // Use a fresh session because we can't wait for the completions here.
      const BerryClass = await load(classLocation, null, kernel, new Session(), timeout)

      // Pluck the damn berry
      return _pluckBerry(berry, hash, version, BerryClass, kernel, session, timeout)
    }
  }

  return await _loadFromLocationWithBanCheck(location, loadFunction, kernel, session, timeout)
}

// ------------------------------------------------------------------------------------------------
// _loadJigFromLocation
// ------------------------------------------------------------------------------------------------

async function _loadJigFromLocation (location, kernel, session, timeout) {
  const loadFunction = async () => {
    timeout._check()

    // Get the state from the cache if it exists
    const key = `${location.includes('?') ? 'berry' : 'jig'}://${location}`
    const options = { all: true, tx: !kernel._trustlist.has('state') }
    const state = kernel._state && await kernel._state.pull(key, options)

    // If there is no cached state, load it via replay. Show!
    if (state) {
      return _loadJigFromState(location, state, kernel, session, timeout)
    }

    return _loadJigViaReplay(location, kernel, session, timeout)
  }

  return await _loadFromLocationWithBanCheck(location, loadFunction, kernel, session, timeout)
}

// ------------------------------------------------------------------------------------------------
// _loadJigFromState
// ------------------------------------------------------------------------------------------------

async function _loadJigFromState (location, state, kernel, session, timeout) {
  const { _txid: txid, _vout: vout, _vdel: vdel } = _location(location)

  let hash = null

  // Get the state hash from the transaction if we don't trust all of the cache.
  if (!kernel._trustlist.has('state')) {
    // Get the transaction and metadata if we are loading a non-berry.
    // Do this here once we already have a state, to allow the cache to populate from State API.
    const rawtx = await kernel._fetch(txid)
    const tx = new Transaction(rawtx)

    // Extract the metadata
    const metadata = _extractMetadata(tx)

    // Check that our location is in range
    const hasVout = typeof vout === 'number' && vout > metadata.vrun && vout < metadata.out.length + metadata.vrun + 1
    const hasVdel = typeof vdel === 'number' && vdel >= 0 && vdel < metadata.del.length
    if (!hasVout && !hasVdel) throw new ArgumentError(`Not a jig: ${location}`)

    hash = hasVout ? metadata.out[vout - metadata.vrun - 1] : metadata.del[vdel]
  }

  // Try recreating from the state cache
  const _recreate = require('./recreate')
  const partial = await _recreate(location, state, hash, kernel, session, timeout)
  session._completers.push(partial._completer)
  return partial._value
}

// ------------------------------------------------------------------------------------------------
// _loadJigViaReplay
// ------------------------------------------------------------------------------------------------

async function _loadJigViaReplay (location, kernel, session, timeout) {
  timeout._check()

  if (kernel._client) throw new ClientModeError(location, 'jig')

  const { _txid: txid, _vout: vout, _vdel: vdel } = _location(location)

  // Get the transaction and metadata
  const rawtx = await kernel._fetch(txid)
  const tx = new Transaction(rawtx)
  let metadata = null
  try {
    metadata = _extractMetadata(tx)
  } catch (e) {
    throw new ExecutionError(e.message)
  }

  let commit = null

  if (session._replays.has(txid)) {
    // If this load session is already replaying, then we re-use the resulting jigs.
    commit = await session._replays.get(txid)
  } else if (ALL_REPLAYS.has(txid)) {
    // If another relpay of this txid is in progress wait for that and then load again
    // Because that replay should add this jig to the cache. Then we can recreate.
    await ALL_REPLAYS.get(txid)

    return await _loadJigFromLocation(location, kernel, session, timeout)
  } else {
    try {
      // Replay the transaction
      const _replay = require('./replay')
      const published = true
      const jigToSync = null
      const preverify = false
      const promise = _replay(tx, txid, metadata, kernel, published, jigToSync, timeout, preverify)

      session._replays.set(txid, promise)
      ALL_REPLAYS.set(txid, promise)

      commit = await promise
    } finally {
      session._replays.delete(txid)
      ALL_REPLAYS.delete(txid)
    }
  }

  // Notify about jigs from the replay
  const record = commit._record
  record._outputs._forEach(jig => kernel._emit('load', jig))
  record._deletes._forEach(jig => kernel._emit('load', jig))

  // Get the jig out of the commit. Outputs are 1-indexed b/c of the metadata.
  if (typeof vout === 'number' && vout > metadata.vrun && vout < record._outputs._size + metadata.vrun + 1) {
    return record._outputs._arr()[vout - metadata.vrun - 1]
  }
  if (typeof vdel === 'number' && vdel >= 0 && vdel < record._deletes._size) {
    return record._deletes._arr()[vdel]
  }

  // No luck. No jig.
  throw new ArgumentError(`Jig not found: ${location}`)
}

// ------------------------------------------------------------------------------------------------
// _loadWithUserBerryClass
// ------------------------------------------------------------------------------------------------

/**
 * Loads a jig using the user-provided berry class
 */
async function _loadWithUserBerryClass (path, BerryClass, kernel, session, timeout) {
  timeout._check()

  const Berry = require('./berry')

  // Check that BerryClass extends from Berry
  if (!_extendsFrom(BerryClass, Berry)) throw new ArgumentError('Berry class must extend from Berry')

  // Check that the path is valid
  if (typeof path !== 'string') throw new ArgumentError('Berry path must be a string')

  // Find or install the berry class
  const B = Editor._lookupOrCreateCode(BerryClass)

  // If the berry class was deployed, see if we can load it from the cache
  const berryClassDeployed = !!_sudo(() => _location(B.location))._txid
  if (berryClassDeployed) {
    const opts = { _berry: path, _version: _PROTOCOL_VERSION }
    const parts = Object.assign(_location(B.location), opts)
    const partialLocation = _compileLocation(parts)

    // Get the state from the cache if it exists
    const key = `${partialLocation.includes('?') ? 'berry' : 'jig'}://${partialLocation}`
    const options = { all: true, tx: !kernel._trustlist.has('state') }
    const state = kernel._state && await kernel._state.pull(key, options)

    if (state) {
      const _recreate = require('./recreate')
      const partial = await _recreate(partialLocation, state, undefined, kernel, session, timeout)
      session._completers.push(partial._completer)
      return partial._value
    }
  }

  // Pluck the berry using the class and path
  return _pluckBerry(path, null, _PROTOCOL_VERSION, B, kernel, session, timeout)
}

// ------------------------------------------------------------------------------------------------
// _pluckBerry
// ------------------------------------------------------------------------------------------------

/**
 * Recreates a berry from scratch using a berry class's pluck function
 */
async function _pluckBerry (path, hash, version, B, kernel, session, timeout) {
  timeout._check()

  _assert(B instanceof Code)

  if (Log._infoOn) Log._info(TAG, 'Pluck', _text(B), path)

  // Create the secure fetch function. Make sure we set CURRENT_RECORD._error
  // in case of fetch errors so that the user code cannot swallow it.
  const fetchCode = `async function(txid) {
    try {
      return await f(txid)
    } catch (e) {
      se(e)
      throw e
    }
  }`
  const fetchEnv = {
    f: kernel._fetch.bind(kernel),
    se: e => { PLUCK_ERROR = PLUCK_ERROR || e }
  }
  const [fetch] = Sandbox._evaluate(fetchCode, fetchEnv)
  Object.freeze(fetch)

  try {
    // Determine the berry's partial location. Undeployed berry clases are errors.
    const berryClassDeployed = !!_sudo(() => _location(B.location))._txid
    let partialLocation = _UNDEPLOYED_LOCATION
    if (berryClassDeployed) {
      partialLocation = _compileLocation(
        Object.assign(_location(B.location), { _berry: path, _version: version }))
    }

    // Set the pluck class and location to be taken inside pluck()
    UNCLAIMED_BERRIES.push(B)
    PLUCK_COUNT++

    if (PLUCK_ERROR) throw PLUCK_ERROR

    // Pluck the berry
    const promise = B.pluck(path, fetch)
    if (!(promise instanceof SI.Promise || promise instanceof HI.Promise)) {
      throw new Error('pluck method must be async')
    }
    const berry = await promise

    // Check the berry is allowed for this berry class
    if (!berry || berry.constructor !== B) throw new Error(`Berry must be an instance of ${_text(B)}`)

    // Cache the berry and determine its final location
    if (berryClassDeployed) {
      // Set the initial location for state capture
      _sudo(() => { berry.location = berry.origin = partialLocation })

      // Calculate the berry state
      const { _captureBerry } = require('./capture')
      const state = _captureBerry(berry, version)

      // Calculate the berry state hash
      const stateString = _deterministicJSONStringify(state)
      const stateBuffer = bsv.deps.Buffer.from(stateString, 'utf8')
      const stateHash = await _sha256(stateBuffer)
      const stateHashHex = stateHash.toString('hex')

      // Make sure the state hash matches if possible
      if (hash && hash !== stateHashHex) throw new Error('Berry state mismatch')

      // Assign the full location to the berry
      const fullLocation = _compileLocation(Object.assign({ _hash: stateHashHex }, _location(partialLocation)))
      _sudo(() => { berry.location = berry.origin = fullLocation })

      // Berries are keyed by their partial location
      const key = `berry://${partialLocation}`
      await kernel._cache.set(key, state)
    }

    if (PLUCK_ERROR) throw PLUCK_ERROR

    return berry
  } catch (e) {
    PLUCK_ERROR = PLUCK_ERROR || e
    throw e
  } finally {
    if (--PLUCK_COUNT === 0) {
      UNCLAIMED_BERRIES = []
      PLUCK_ERROR = null
    }
  }
}

// ------------------------------------------------------------------------------------------------
// _loadFromLocationWithBanCheck
// ------------------------------------------------------------------------------------------------

async function _loadFromLocationWithBanCheck (location, loadFunction, kernel, session, timeout) {
  // Check if we've previously tried to load this creation and it failed. Don't try again.
  let bannedValue
  try {
    bannedValue = await kernel._state.pull(`ban://${location}`)
  } catch (e) {
    // Swallow cache get failures, because it's a cache.
    if (Log._warnOn) Log._warn(TAG, `Failure to get from cache ban://${location}\n\n${e.toString()}`)
  }

  // If banned due to a trust issue, but now that txid is trusted, unban it.
  // If the ban was due to a prior RunConnect plugin bug, also unban it.
  let banned = typeof bannedValue === 'object' && bannedValue
  if (banned) {
    const dueToTrustButNowTrusted = bannedValue.untrusted && await kernel._trusted(bannedValue.untrusted)
    const dueToStateServerDown = banned.reason.includes('Cannot convert undefined or null to object')
    const unban = dueToTrustButNowTrusted || dueToStateServerDown

    if (unban) {
      try {
        await kernel._cache.set(`ban://${location}`, false)
      } catch (e) {
        // Swallow cache set failures, because it's a cache.
        if (Log._warnOn) Log._warn(TAG, `Failure to unban from cache ${location}\n\n${e.toString()}`)
      }
      banned = false
    }
  }

  // Banned jigs do not load
  if (banned) {
    // If the jig was banned due to trust, present the original error as is
    if (bannedValue.untrusted) throw new Error(bannedValue.reason)

    const hint = `Hint: If you wish to unban this location: await run.cache.set('ban://${location}', false)`
    throw new Error(`Failed to load banned location: ${location}\n\nReason: ${bannedValue.reason}\n\n${hint}`)
  }

  try {
    return await loadFunction(location)
  } catch (e) {
    // Only internal deterministic execution errors should result in a ban.
    if (e instanceof ExecutionError || e instanceof TrustError) {
      try {
        const value = { reason: e.toString() }
        if (e instanceof TrustError) value.untrusted = e.txid
        await kernel._cache.set(`ban://${location}`, value)
      } catch (e) {
        // Swallow cache set failures by default
        if (Log._warnOn) Log._warn(TAG, `Swallowing failure to cache set ban://${location}`, e.toString())
      }
    }

    throw e
  }
}

// ------------------------------------------------------------------------------------------------
// _loadNative
// ------------------------------------------------------------------------------------------------

/**
 * Specifically loads a built-in class as a dependency
 *
 * Example: native://Jig
 */
function _loadNative (location, timeout) {
  timeout._check()

  const { _native: native } = _location(location)

  // Find the native code
  const C = Editor._lookupNativeCodeByName(native)
  if (!C) throw new ArgumentError(`Native code not found: ${native}`)

  // Make sure it's not internal
  const editor = Editor._get(C)
  if (editor._internal) throw new ArgumentError(`${_text(C)} cannot be a dependency`)

  // Return the jig
  return C
}

// ------------------------------------------------------------------------------------------------
// claimBerry
// ------------------------------------------------------------------------------------------------

function claimBerry (B) {
  // Ensures that we only pluck once. The async nature of the pluck() function means that
  // we can't 100% ensure that all berries are plucked from their class, so we will move to
  // a non-async pluck() function in v0.7, and ban any berries that do this, but it is unlikely
  // this flaw will be discovered before then.
  const index = UNCLAIMED_BERRIES.indexOf(B)
  if (index === -1) {
    throw new Error('Must only create berry from its berry class')
  }
  UNCLAIMED_BERRIES.splice(index, 1)
}

// ------------------------------------------------------------------------------------------------

load._Session = Session
load._claimBerry = claimBerry

module.exports = load
