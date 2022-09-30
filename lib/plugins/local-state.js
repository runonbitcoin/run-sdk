/**
 * local-state.js
 *
 * A local state API that uses the cache to store and retrieve results
 */

const StateWrapper = require('./state-wrapper')

// ------------------------------------------------------------------------------------------------
// LocalState
// ------------------------------------------------------------------------------------------------

class LocalState extends StateWrapper {
  async pull () { /* no-op */ }
}

// ------------------------------------------------------------------------------------------------

module.exports = LocalState
