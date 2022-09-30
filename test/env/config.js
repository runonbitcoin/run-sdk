/**
 * config.js
 *
 * Provides test settings
 */

/* global VARIANT */

require('dotenv').config()
const unmangle = require('./unmangle')

// ------------------------------------------------------------------------------------------------
// Configure the test environment
// ------------------------------------------------------------------------------------------------

const COVER = process.env.COVER ? JSON.parse(process.env.COVER) : false
const STRESS = process.env.STRESS ? JSON.parse(process.env.STRESS) : false
const NETWORK = process.env.NETWORK ? process.env.NETWORK : 'mock'
const API = process.env.API ? process.env.API : 'run'
const MANGLED = process.env.MANGLED ? process.env.MANGLED : false
const BROWSER = typeof VARIANT !== 'undefined' && VARIANT === 'browser'

unmangle.enable(MANGLED)

// ------------------------------------------------------------------------------------------------

module.exports = { COVER, STRESS, NETWORK, API, BROWSER }
