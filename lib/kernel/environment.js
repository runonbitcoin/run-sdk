/**
 * environment.js
 *
 * Checks that the environment is valid for the Run kernel
 */

const bsv = require('bsv')

// ------------------------------------------------------------------------------------------------
// _nodejs
// ------------------------------------------------------------------------------------------------

function _nodejs () {
  return process && process.version
}

// ------------------------------------------------------------------------------------------------
// _browser
// ------------------------------------------------------------------------------------------------

function _browser () {
  return typeof window !== 'undefined' && window.document && window.navigator
}

// ------------------------------------------------------------------------------------------------
// _check
// ------------------------------------------------------------------------------------------------

function _check () {
  _checkBsvLibrary()
  _checkNode()
  _checkBrowser()
}

// ------------------------------------------------------------------------------------------------
// _checkBsvLibrary
// ------------------------------------------------------------------------------------------------

function _checkBsvLibrary () {
  if (typeof bsv.version !== 'string' || !bsv.version.startsWith('v1.')) {
    const hint = 'Hint: Please install bsv version 1.5.4 or install the Run SDK from NPM'
    throw new Error(`Run requires version 1.x of the bsv library\n\n${hint}`)
  }
}

// ------------------------------------------------------------------------------------------------
// _checkNode
// ------------------------------------------------------------------------------------------------

function _checkNode () {
  if (!_nodejs()) return

  const nodeVersion = Number(process.version.match(/^v(\d+\.\d+)/)[1])
  if (nodeVersion < 10) throw new Error('Run is supported only from Node 10 to Node 18')
  if (nodeVersion >= 19) throw new Error('Run is supported only from Node 10 to Node 18')
}

// ------------------------------------------------------------------------------------------------
// _checkBrowser
// ------------------------------------------------------------------------------------------------

function _checkBrowser () {
  if (!_browser()) return

  // IE not supported
  const userAgent = window.navigator.userAgent
  const ie = userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident') !== -1
  if (ie) throw new Error('Run is not supported on Internet Explorer. Please upgrade to Edge.')

  // iOS <= 12 not supported
  if (/iP(hone|od|ad)/.test(navigator.platform)) {
    var v = (navigator.appVersion).match(/OS (\d+)_(\d+)_?(\d+)?/)
    const version = [parseInt(v[1], 10), parseInt(v[2], 10), parseInt(v[3] || 0, 10)]
    if (version[0] < 13) throw new Error('Run is not supported on this iOS version. Please upgrade to iOS 13 or above.')
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _nodejs,
  _browser,
  _check,
  _checkBsvLibrary,
  _checkNode,
  _checkBrowser
}
