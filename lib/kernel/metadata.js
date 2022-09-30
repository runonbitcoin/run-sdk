/**
 * metadata.js
 *
 * Parses RUN transaction metadata
 */

const bsv = require('bsv')
const { _location } = require('./bindings')

// ------------------------------------------------------------------------------------------------
// _extractMetadata
// ------------------------------------------------------------------------------------------------

function _extractMetadata (tx) {
  const { _parseMetadataVersion } = require('./version')

  const BAD_PROTOCOL_ERROR = 'Not a RUN transaction: invalid OP_RETURN protocol'
  const BAD_METADATA_ERROR = 'Not a RUN transaction: invalid RUN metadata'

  if (!tx.outputs.length) throw new Error(BAD_PROTOCOL_ERROR)

  let chunks = null
  const base = new bsv.Transaction()

  for (let i = 0; i < tx.outputs.length; i++) {
    chunks = tx.outputs[i].script.chunks

    const badProtocol =
      chunks.length !== 6 ||
      chunks[0].opcodenum !== 0 || // OP_FALSE
      chunks[1].opcodenum !== 106 || // OP_RETURN
      chunks[2].buf.toString() !== 'run'

    if (!badProtocol) {
      break
    } else {
      base.addOutput(tx.outputs[i])
      chunks = null
    }
  }

  if (!chunks) throw new Error(BAD_PROTOCOL_ERROR)

  const version = _parseMetadataVersion(chunks[3].buf.toString('hex'))
  const app = chunks[4].buf ? chunks[4].buf.toString() : ''

  try {
    const json = chunks[5].buf.toString('utf8')
    const metadata = JSON.parse(json)

    const badMetadata =
      Object.keys(metadata).length !== 6 ||
      typeof metadata.in !== 'number' ||
      !Array.isArray(metadata.ref) ||
      !Array.isArray(metadata.out) ||
      !Array.isArray(metadata.del) ||
      !Array.isArray(metadata.cre) ||
      !Array.isArray(metadata.exec) ||
      metadata.ref.some(ref => typeof ref !== 'string') ||
      metadata.out.some(hash => typeof hash !== 'string') ||
      metadata.del.some(hash => typeof hash !== 'string') ||
      metadata.exec.some(hash => typeof hash !== 'object')

    if (badMetadata) throw new Error(BAD_METADATA_ERROR)

    metadata.app = app
    metadata.version = version
    metadata.base = base.toString('hex')
    metadata.vrun = base.outputs.length

    return metadata
  } catch (e) {
    throw new Error(BAD_METADATA_ERROR)
  }
}

// ------------------------------------------------------------------------------------------------
// _extractTxDeps
// ------------------------------------------------------------------------------------------------

function _extractTxDeps (tx) {
  const metadata = _extractMetadata(tx)

  const txids = new Set()

  // Add inputs
  for (let i = 0; i < metadata.in; i++) {
    const txid = tx.inputs[i].prevTxId.toString('hex')
    txids.add(txid)
  }

  // Add refs, including berries
  for (const location of metadata.ref) {
    // Native jigs do not have txids
    if (location.startsWith('native://')) continue

    // Extract the txid of the jig or berry class
    const txid = location.slice(0, 64)
    txids.add(txid)

    // If a berry, extract other txids used to load it from the berry path. This only works for
    // Run 0.6 for fixed berries we support. In Run 0.7, we will include all txids in the location.
    const isBerry = location.includes('?berry=')
    if (isBerry) {
      const loc = _location(location)
      let berryTxid = loc._berry
      if (berryTxid.length > 64) {
        try {
          berryTxid = JSON.parse(loc._berry).txid
        } catch (e) { }
      }
      if (berryTxid.length === 64) {
        txids.add(berryTxid)
      }
    }
  }

  return Array.from(txids)
}

// ------------------------------------------------------------------------------------------------

module.exports = { _extractMetadata, _extractTxDeps }
