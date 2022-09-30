/**
 * log.js
 *
 * The logger used throughout Run. It wraps another logger to add date and tag information,
 * and also provides a consistent API when different loggers don't implement all methods.
 *
 * Setup:
 *
 *    Assign Log._logger to an object with any of info(), warn(), error(), or debug() methods.
 *
 *    Log._logger = console
 *
 * Usage:
 *
 *    if (Log._infoOn) Log._info(TAG, 'arg1', 'arg2')
 *
 *    We recommend checking the "on" booleans first to avoid unnecessary string serialization.
 *
 *    TAG is typically the filename or class where the log is ocurring.
 */

// ------------------------------------------------------------------------------------------------
// Log
// ------------------------------------------------------------------------------------------------

const Log = {
  // The log sink where all messages are forwarded to
  _logger: null,

  // The key functions used to log
  _info (...args) { this._log('info', ...args) },
  _warn (...args) { this._log('warn', ...args) },
  _error (...args) { this._log('error', ...args) },
  _debug (...args) { this._log('debug', ...args) },

  // Boolean checkers for whether the log will actually occur
  get _infoOn () { return !!this._logger && !!this._logger.info && typeof this._logger.info === 'function' },
  get _warnOn () { return !!this._logger && !!this._logger.warn && typeof this._logger.warn === 'function' },
  get _errorOn () { return !!this._logger && !!this._logger.error && typeof this._logger.error === 'function' },
  get _debugOn () { return !!this._logger && !!this._logger.debug && typeof this._logger.debug === 'function' },

  // Interal log function
  _log (method, tag, ...args) {
    if (!this._logger || !this._logger[method] || typeof this._logger[method] !== 'function') return

    this._logger[method](new Date().toISOString(), method.toUpperCase(), `[${tag}]`, ...args)
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Log
