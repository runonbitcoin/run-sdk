
/**
 * version.js
 *
 * Describes the version changes that have occurred to the protocol.
 *
 * Summary
 *
 *      Name            Protocol        Changes
 *      ----------      ----------      ----------
 *      0.6             5               Initial launch
 *
 * Notes
 *
 *      - The RUN protocol is designed to evolve
 *      - Jigs created with previous RUN versions will continue to be supported
 *      - Jigs cannot be used in a tx with an earlier protocol version than themselves had
 */

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const PROTOCOL_VERSION = 5

// ------------------------------------------------------------------------------------------------
// Functions
// ------------------------------------------------------------------------------------------------

function version (ver) {
  if (ver !== PROTOCOL_VERSION) throw new Error(`Unsupported version: ${ver}`)
  return ver
}

// ------------------------------------------------------------------------------------------------

function parseMetadataVersion (metadataVersion) {
  const version = typeof metadataVersion === 'string' && metadataVersion.length === 2 && parseInt(metadataVersion, 16)
  if (version === 5) return 5
  const hint = version > 5 ? '\n\nHint: Upgrade your Run SDK to load this transaction' : ''
  throw new Error(`Unsupported RUN transaction version: ${metadataVersion}${hint}`)
}

// ------------------------------------------------------------------------------------------------

function parseStateVersion (stateVersion) {
  // In the initial launch of RUN, the state and protocol versions were considered separate,
  // and the initial protocol was 5 but the state was 4. This is unified to mean a single
  // version, 5, before launch, but due to jigs already deployed this state version persists.
  if (stateVersion === '04') return PROTOCOL_VERSION
  throw new Error(`Unsupported state version: ${stateVersion}`)
}

// ------------------------------------------------------------------------------------------------

function getMetadataVersion (protocolVersion) {
  if (protocolVersion === 5) return '05'
  throw new Error(`Unsupported protocol version: ${protocolVersion}`)
}

// ------------------------------------------------------------------------------------------------

function getStateVersion (protocolVersion) {
  // See comment in parseStateVersion
  if (protocolVersion === 5) return '04'
  throw new Error(`Unsupported protocol version: ${protocolVersion}`)
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _PROTOCOL_VERSION: PROTOCOL_VERSION,
  _version: version,
  _parseMetadataVersion: parseMetadataVersion,
  _parseStateVersion: parseStateVersion,
  _getMetadataVersion: getMetadataVersion,
  _getStateVersion: getStateVersion
}
