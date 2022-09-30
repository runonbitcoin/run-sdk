/**
 * index.js
 *
 * Primary library export, environment checks, and global sets
 */

// Environment checks
require('./kernel/environment')._check()

const bsv = require('bsv')
const Run = require('./run')
const { _patchBsv } = require('./kernel/bsv')
const { _defineGetter } = require('./kernel/misc')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

global.Jig = Run.Jig
global.Berry = Run.Berry

// Preinstalled extras are defined with getters to facilitate code coverage
_defineGetter(global, 'Token', () => { return Run.extra.Token })

// ------------------------------------------------------------------------------------------------
// Patch BSV
// ------------------------------------------------------------------------------------------------

_patchBsv(bsv)

// ------------------------------------------------------------------------------------------------

module.exports = Run
