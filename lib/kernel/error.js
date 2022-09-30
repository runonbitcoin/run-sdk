/**
 * errors.js
 *
 * Custom Error classes thrown by Run.
 *
 * Custom errors are used when the user is expected to be able to respond differently for them,
 * or when there is custom data that should be attached to the error.
 */

// ------------------------------------------------------------------------------------------------
// ArgumentError
// ------------------------------------------------------------------------------------------------

class ArgumentError extends Error {
  constructor (message = 'Unknown reason') {
    super(message)
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// ClientModeError
// ------------------------------------------------------------------------------------------------

/**
 * Error when performing disallowed actions in client mode
 */
class ClientModeError extends Error {
  constructor (data, type) {
    const hint = `Only cached ${type}s may be loaded in client mode`
    const message = `Cannot load ${data}\n\n${hint}`
    super(message)
    this.data = data
    this.type = type
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// ExecutionError
// ------------------------------------------------------------------------------------------------

/**
 * Error for a deterministic failure to load a jig
 */
class ExecutionError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// InternalError
// ------------------------------------------------------------------------------------------------

class InternalError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// NotImplementedError
// ------------------------------------------------------------------------------------------------

/**
 * Error when a method is deliberately not implemented
 */
class NotImplementedError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// TimeoutError
// ------------------------------------------------------------------------------------------------

/**
 * Error when an async call times out
 */
class TimeoutError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------
// TrustError
// ------------------------------------------------------------------------------------------------

/**
 * Error when a txid is not trusted and has code Run tried to execute
 */
class TrustError extends Error {
  constructor (txid, from) {
    const hint = 'Hint: Trust this txid using run.trust(txid) if you know it is safe'
    const message = `Cannot load untrusted code${from ? ' via ' + from : ''}: ${txid}\n\n${hint}`
    super(message)
    this.txid = txid
    this.from = from
    this.name = this.constructor.name
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  ArgumentError,
  ClientModeError,
  ExecutionError,
  InternalError,
  NotImplementedError,
  TimeoutError,
  TrustError
}
