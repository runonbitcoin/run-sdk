/**
 * run.js
 *
 * Provides the build of RUN for testing
 */

require('dotenv').config()
const path = require('path')

// ------------------------------------------------------------------------------------------------
// Load Run
// ------------------------------------------------------------------------------------------------

const Run = process.env.LIB ? require(path.join(process.cwd(), process.env.LIB)) : require('target')

// ------------------------------------------------------------------------------------------------
// Configure Run
// ------------------------------------------------------------------------------------------------

// Prefer mocknet and no logs (but logger methods!) for testing
Run.defaults.network = 'mock'
Run.defaults.logger = {
  info: () => { },
  debug: () => { },
  warn: () => { },
  error: () => { }
}
Run.defaults.trust = '*'

// Read the local environment vars to configure Run for the tests

// We have to extract all values manually from process.env because of how the
// webpack.EnvironmentPlugin works. See: https://github.com/webpack/webpack/issues/5392

Run.configure({
  NETWORK: process.env.NETWORK,
  PURSE: process.env.PURSE,
  PURSE_MAIN: process.env.PURSE_MAIN,
  PURSE_TEST: process.env.PURSE_TEST,
  PURSE_STN: process.env.PURSE_STN,
  PURSE_MOCK: process.env.PURSE_MOCK,
  OWNER: process.env.OWNER,
  OWNER_MAIN: process.env.OWNER_MAIN,
  OWNER_TEST: process.env.OWNER_TEST,
  OWNER_STN: process.env.OWNER_STN,
  OWNER_MOCK: process.env.OWNER_MOCK,
  APP: process.env.APP,
  LOGGER: process.env.LOGGER,
  API: process.env.API,
  APIKEY: process.env.APIKEY,
  APIKEY_RUN: process.env.APIKEY_RUN,
  APIKEY_WHATSONCHAIN: process.env.APIKEY_WHATSONCHAIN
})

// ------------------------------------------------------------------------------------------------

module.exports = Run
