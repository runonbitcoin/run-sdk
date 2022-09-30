/**
 * replay.js
 *
 * Replays a transaction and generates a commit with live objects
 */

const bsv = require('bsv')
const { _text, _Timeout } = require('./misc')
const { _deterministicJSONStringify } = require('./determinism')
const Log = require('./log')
const _load = require('./load')
const Record = require('./record')
const { _unifyForReplay, _deunifyForReplay, _setUnifyForMethodEnabled } = require('./unify')
const { _sudo } = require('./admin')
const Json = require('./json')
const Sandbox = require('./sandbox')
const {
  _createMasterList, _finalizeOwnersAndSatoshis, _captureStates, _hashStates, _generateOutputScripts,
  _createExec, _createMetadata, _createPartialTx, _finalizeLocationsAndOrigins, _cacheStates
} = require('./publish')
const CreationSet = require('./creation-set')
const { TrustError, ExecutionError } = require('./error')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const TAG = 'Replay'

// ------------------------------------------------------------------------------------------------
// _Preverify
// ------------------------------------------------------------------------------------------------

class _Preverify {
  constructor (record, states) { this._record = record; this._states = states }
  _output (n) { return this._states.get(this._record._outputs._arr()[n]) }
  _delete (n) { return this._states.get(this._record._deletes._arr()[n]) }
}

// ------------------------------------------------------------------------------------------------
// _replay
// ------------------------------------------------------------------------------------------------

/**
 * Creates a record by replaying a transaction. The returned record must be published
 */
async function _replay (tx, txid, metadata, kernel, published, jigToSync, timeout, preverify) {
  const _execute = require('./execute')

  if (Log._infoOn) Log._info(TAG, 'Replay', txid)

  const start = new Date()

  timeout = timeout || new _Timeout('replay', kernel._timeout, txid)
  timeout._check()

  // Check that the code is trusted to load
  const anythingToTrust = !preverify &&
    (metadata.exec.some(action => action.op === 'DEPLOY') ||
    metadata.exec.some(action => action.op === 'UPGRADE'))

  if (anythingToTrust) {
    if (!(await kernel._trusted(txid, 'replay'))) throw new TrustError(txid, 'replay')
  }

  let inputs = []
  let refs = []

  // Share a load session for replays and cache loads
  const session = new _load._Session()

  // Load inputs
  for (let vin = 0; vin < metadata.in; vin++) {
    const input = tx.inputs[vin]
    if (!input) throw new Error(`Jig input missing for _i${vin}`)
    const txid = input.prevTxId.toString('hex')
    const vout = input.outputIndex
    const location = `${txid}_o${vout}`
    const promise = _load(location, undefined, kernel, session, timeout)
    inputs.push(promise)
  }

  // Load refs
  for (let vref = 0; vref < metadata.ref.length; vref++) {
    const location = metadata.ref[vref]
    const promise = _load(location, undefined, kernel, session, timeout)
    refs.push(promise)
  }

  // Wait for all inputs and ref loads to complete
  inputs = await Promise.all(inputs)
  refs = await Promise.all(refs)

  // Make sure the jig to sync exists
  if (jigToSync) {
    if (!inputs.some(x => x.location === jigToSync.location)) {
      throw new Error(`${_text(jigToSync)} not found in the transaction\n\ntxid: ${txid}\njig: ${jigToSync.location}`)
    }
  }

  // Create a new record to replay
  const record = new Record()

  // We will manually commit and then verify the record
  record._replaying = true
  record._autopublish = false

  // Save the current record to replace back after we finish executing this replay
  const savedRecord = Record._CURRENT_RECORD

  // Disable method unification because we already unified everything
  _setUnifyForMethodEnabled(false)

  // Set the backing limit to a max value, overriding user value, to make it a soft cap and keep consensus
  const oldBackingLimit = kernel._backingLimit
  kernel._backingLimit = Number.MAX_SAFE_INTEGER

  let refmap = null
  let deunifyMap = null

  // Replay the actions, creating a record
  try {
    // Update the references for each incoming jig with other incoming jigs
    // Also build the refmap. This is faster than building it during capture states.
    const unifyResult = _unifyForReplay(inputs, refs, jigToSync)
    refmap = unifyResult._refmap
    deunifyMap = unifyResult._deunifyMap

    // Replace the input with the jig to sync
    if (jigToSync) {
      inputs[inputs.findIndex(x => x.location === jigToSync.location)] = jigToSync
    }

    // Add the incoming jigs to the record.
    // We add inputs to UPDATE instead of AUTH to ensure they are ordered first in the commit.
    inputs.forEach(jig => record._update(jig))
    refs.forEach(jig => record._read(jig))

    // Replace the current record with ours while we execute actions
    Record._CURRENT_RECORD = record

    // Execute each action
    for (const entry of metadata.exec) {
      const { op, data } = entry

      if (Object.keys(entry).length !== 2) throw new Error('Invalid exec')
      if (typeof op !== 'string') throw new Error(`Invalid op: ${op}`)
      if (typeof data !== 'object' || !data) throw new Error(`Invalid data: ${data}`)

      const masterSet = new CreationSet()
      for (const x of inputs) { masterSet._add(x) }
      for (const x of refs) { masterSet._add(x) }
      for (const x of record._creates) { masterSet._add(x) }
      const masterList = masterSet._arr()

      _execute(op, data, masterList)
    }
  } catch (e) {
    // Probably not needed, but roll back the current record anyway
    record._rollback(e)

    throw new ExecutionError(e.message)
  } finally {
    // Restore the previous record
    Record._CURRENT_RECORD = savedRecord

    // Reset back the max backed satoshis
    kernel._backingLimit = oldBackingLimit

    // Re-enable method unification
    _setUnifyForMethodEnabled(true)
  }

  // Save the commit to make sure it's deactivated at the end
  let commit = null

  // Capture the states after verify
  let states = null

  // Convert the record a commit and verify it
  try {
    // Create a commit
    commit = record._commit()
    if (!commit) throw new Error('Invalid metadata: no commit generated')

    // Apply the app and version to the record
    commit._app = metadata.app
    commit._version = metadata.version
    commit._base = new bsv.Transaction(metadata.base)

    // Apply the refmap we already generated
    commit._refmap = refmap

    // Verify the commit
    states = await verify(commit, tx, txid, metadata, timeout, preverify)
  } catch (e) {
    throw new ExecutionError(e.message)
  }

  if (published) {
    // Finalize jig bindings
    _finalizeLocationsAndOrigins(commit, txid)

    // Add the state to the cache
    await _cacheStates(commit, states, txid)
    timeout._check()
  }

  // Note: We don't emit jig events because we haven't checked if jigs are unspent.

  // Before returning deunify so that we get the same references whether
  // loading from cache or via replay
  _deunifyForReplay(deunifyMap)

  if (Log._debugOn) Log._debug(TAG, 'Replay (end): ' + (new Date() - start) + 'ms')

  // Return the commit to be used. Its record may even be analyzed.
  return commit
}

// ------------------------------------------------------------------------------------------------
// verify
// ------------------------------------------------------------------------------------------------

async function verify (commit, tx, txid, txmetadata, timeout, preverify) {
  if (Log._debugOn) Log._debug(TAG, 'Verify', txid)

  const start = new Date()
  const record = commit._record

  // Create the sorted master list used to serialize actions
  const masterList = _createMasterList(record)

  // Assign initial owners for new creates from the tx metadata
  _assignOwnersFromMetadata(commit, txmetadata, masterList)

  // Generate the output scripts, adding refs as needed
  const outputScripts = await _generateOutputScripts(commit)

  // Make owner and satoshis bound
  _finalizeOwnersAndSatoshis(commit)

  // Calculate the serialized states of output and deleted jigs
  const states = await _captureStates(commit, timeout)
  timeout._check()

  // Calculate state hashes
  const hashes = await _hashStates(commit, states)

  // Convert the actions to executable statements
  const exec = _createExec(record, masterList)

  // Create the OP_RETURN metadata json
  const metadata = _createMetadata(commit, hashes, exec, masterList)

  // Create the unpaid and unsigned tx. Use 0 dust, because we don't really care what the dust
  // used in the original transaction was, as long as the satoshis outputted meet a minimum.
  // The dust is a calculation of the minimum relay fee.
  const feePerKb = 0
  const partialtx = _createPartialTx(commit, metadata, outputScripts, feePerKb)

  // Compare metadata. Key order does not matter in the metadata.
  if (_deterministicJSONStringify(metadata) !== _deterministicJSONStringify(txmetadata)) {
    _throwMetadataMismatchError(txmetadata, metadata, record, states, preverify)
  }

  // Compare inputs
  for (let i = 0; i < metadata.in; i++) {
    const txin1 = tx.inputs[i]
    const txin2 = partialtx.inputs[i]
    const prevtxid1 = txin1.prevTxId.toString('hex')
    const prevtxid2 = txin2.prevTxId.toString('hex')
    if (prevtxid1 !== prevtxid2) throw new Error(`Txid mismatch on input ${i}`)
    if (txin1.outputIndex !== txin2.outputIndex) throw new Error(`Vout mismatch on input ${i}`)
  }

  // Compare outputs
  for (let i = 0; i < metadata.out.length; i++) {
    const txout1 = tx.outputs[i + metadata.vrun + 1]
    const txout2 = partialtx.outputs[i + metadata.vrun + 1]
    if (!txout1) throw new Error(`Jig output missing for _o${i + metadata.vrun + 1}`)
    const script1 = txout1.script.toString('hex')
    const script2 = txout2.script.toString('hex')
    if (script1 !== script2) throw new Error(`Script mismatch on output ${i + metadata.vrun + 1}`)
    if (txout1.satoshis < txout2.satoshis) {
      const hint = `Hint: Transaction has ${txout1.satoshis} but expected ${txout2.satoshis}`
      throw new Error(`Satoshis mismatch on output ${i + metadata.vrun + 1}\n\n${hint}`)
    }
  }

  if (Log._debugOn) Log._debug(TAG, 'Verify (end): ' + (new Date() - start) + 'ms')

  return states
}

// ------------------------------------------------------------------------------------------------

function _throwMetadataMismatchError (expected, actual, record, states, preverify) {
  if (Log._errorOn) Log._error(TAG, 'Expected metadata:', JSON.stringify(expected, 0, 3))
  if (Log._errorOn) Log._error(TAG, 'Actual metadata:', JSON.stringify(actual, 0, 3))

  // The most common error is state hash mismatches, and these are the hardest to debug.
  // Print debugging information in these cases if we know this is the cause.
  function logBadState (expectedHash, actualHash, jig, preverifyState) {
    if (expectedHash === actualHash) return

    const state = states.get(jig)

    // If we caught this during pre-verify, then we have the before state and should print it.
    // Otherwise, just print the current state in hopes that it might show an obvious error.
    if (preverifyState) {
      Log._error(TAG, 'Expected state:', JSON.stringify(preverifyState, 0, 3))
      Log._error(TAG, 'Actual state:', JSON.stringify(state, 0, 3))
    } else {
      Log._error(TAG, 'State mismatch:', JSON.stringify(state, 0, 3))
    }
  }

  if (Log._errorOn) {
    // Log differences in outputs if any
    if (expected.out.length === actual.out.length) {
      expected.out.forEach((expectedHash, n) => {
        logBadState(expectedHash, actual.out[n], record._outputs._arr()[n], preverify && preverify._output(n))
      })
    } else {
      Log._error(TAG, `Expected ${expected.out.length} outputs but actual was ${actual.out.length}`)
    }

    // Log differences in deletes if any
    if (expected.del.length === actual.del.length) {
      expected.del.forEach((expectedHash, n) => {
        logBadState(expectedHash, actual.del[n], record._deletes._arr()[n], preverify && preverify._delete(n))
      })
    } else {
      Log._error(TAG, `Expected ${expected.del.length} deletes but actual was ${actual.del.length}`)
    }
  }

  throw new Error('Metadata mismatch\n\nHint: See logs')
}

// ------------------------------------------------------------------------------------------------

function _assignOwnersFromMetadata (commit, txmetadata, masterList) {
  const decodeOptions = {
    _intrinsics: Sandbox._intrinsics,
    _decodeJig: (n) => masterList[n]
  }

  // Inflate the owners
  const owners = txmetadata.cre.map(lock => Json._decode(lock, decodeOptions))

  // Check that the owners list length matches the number of creates
  if (commit._record._creates._size !== txmetadata.cre.length) throw new Error('Invalid number of cre entries')

  // Assign the owners to the new creates and after state
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i]
    const jig = commit._record._creates._arr()[i]
    const state = commit._after.get(jig)

    _sudo(() => { jig.owner = owner })
    state._props.owner = owner
  }
}

// ------------------------------------------------------------------------------------------------

_replay._Preverify = _Preverify

module.exports = _replay
