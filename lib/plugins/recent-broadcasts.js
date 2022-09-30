/**
 * recent-broadcasts.js
 *
 * A data structure stored in the cache that keeps track of recently broadcasted transactions
 * in order to correct UTXOs returned from a server that might have delayed indexing.
 *
 * The recent broadcasts are stored in the cache under config://recent-broadcasts as an array
 * with the following structure:
 *
 *    [
 *      {
 *        txid: string,
 *        time: number,
 *        inputs: [{ txid: string, vout: number }],
 *        outputs: [{ txid: string, vout: number, script: string, satoshis: number }]
 *      }
 *    ]
 */

const { _filterInPlace } = require('../kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const DEFAULT_UTXO_INDEXING_DELAY = 10000

const CONFIG_KEY_RECENT_BROADCASTS = 'config://recent-broadcasts'

// ------------------------------------------------------------------------------------------------
// _addToCache
// ------------------------------------------------------------------------------------------------

async function _addToCache (cache, bsvtx, txid, expiration = DEFAULT_UTXO_INDEXING_DELAY) {
  const recentBroadcasts = await cache.get(CONFIG_KEY_RECENT_BROADCASTS) || []
  _removeExpired(recentBroadcasts, expiration)
  _add(recentBroadcasts, bsvtx, txid)
  await cache.set(CONFIG_KEY_RECENT_BROADCASTS, recentBroadcasts)
}

// ------------------------------------------------------------------------------------------------
// _correctUtxosUsingCache
// ------------------------------------------------------------------------------------------------

async function _correctUtxosUsingCache (cache, utxos, script, expiration = DEFAULT_UTXO_INDEXING_DELAY) {
  const recentBroadcasts = await cache.get(CONFIG_KEY_RECENT_BROADCASTS)
  if (!recentBroadcasts) return
  _removeExpired(recentBroadcasts, expiration)
  _correctUtxos(recentBroadcasts, utxos, script)
}

// ------------------------------------------------------------------------------------------------
// _add
// ------------------------------------------------------------------------------------------------

function _add (recentBroadcasts, bsvtx, txid) {
  const inputs = bsvtx.inputs.map(input => {
    return {
      txid: input.prevTxId.toString('hex'),
      vout: input.outputIndex
    }
  })

  const outputs = bsvtx.outputs.map((output, vout) => {
    const script = output.script.toHex()
    const satoshis = output.satoshis
    return { txid, vout, script, satoshis }
  })

  const rawtx = bsvtx.toString()

  const recentTx = { rawtx, txid, time: Date.now(), inputs, outputs }

  recentBroadcasts.push(recentTx)
}

// ------------------------------------------------------------------------------------------------
// _correctUtxos
// ------------------------------------------------------------------------------------------------

function _correctUtxos (recentBroadcasts, utxos, script) {
  // Add all utxos from our recent broadcasts for this script that aren't already there
  recentBroadcasts.forEach(tx => {
    tx.outputs.forEach(output => {
      if (output.script !== script) return
      if (utxos.some(utxo => utxo.txid === output.txid && utxo.vout === output.vout)) return
      utxos.push(output)
    })
  })

  // Remove all utxos that we know are spent because they are in our broadcast cache
  _filterInPlace(utxos, utxo => {
    return !recentBroadcasts.some(tx => tx.inputs.some(input => input.txid === utxo.txid && input.vout === utxo.vout))
  })
}

// ------------------------------------------------------------------------------------------------
// _removeExpired
// ------------------------------------------------------------------------------------------------

function _removeExpired (recentBroadcasts, expiration = DEFAULT_UTXO_INDEXING_DELAY) {
  _filterInPlace(recentBroadcasts, tx => Date.now() - tx.time < expiration)
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _addToCache,
  _correctUtxosUsingCache,
  _add,
  _correctUtxos,
  _removeExpired
}
