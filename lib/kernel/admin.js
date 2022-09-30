/**
 * admin.js
 *
 * Enables and checks for admin mode
 */

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

let ADMIN = false

// ------------------------------------------------------------------------------------------------
// _sudo
// ------------------------------------------------------------------------------------------------

/**
 * Enables admin mode for the duration of f.
 *
 * Many internal objects, including jigs, code, and code prototypes, are proxies to the external
 * users. This enables Run to enforce restrictions on the user, such as preventing certain
 * functions from being called. However internally we often need to bypass such restrictions.
 * _sudo() and _admin() are the two methods to achieve this.
 */
function _sudo (f) {
  const prevAdmin = ADMIN
  try {
    ADMIN = true
    return f()
  } finally {
    ADMIN = prevAdmin
  }
}

// ------------------------------------------------------------------------------------------------
// _admin
// ------------------------------------------------------------------------------------------------

function _admin () {
  return ADMIN
}

// ------------------------------------------------------------------------------------------------

module.exports = { _sudo, _admin }
