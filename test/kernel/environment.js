/**
 * environment.js
 *
 * Tests for lib/kernel/environment.js
 */

const bsv = require('bsv')
const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { _check } = unmangle(unmangle(Run)._environment)

// --------------------------------------------------------------------------
// _check
// --------------------------------------------------------------------------

describe('_check', () => {
  // ------------------------------------------------------------------------
  // bsv
  // ------------------------------------------------------------------------

  describe('bsv', () => {
    function testBsvVersion (version) {
      const oldVersion = bsv.version
      try {
        bsv.version = version
        _check()
      } finally {
        bsv.version = oldVersion
      }
    }

    // ----------------------------------------------------------------------

    it('bsv 1.x does not throw an error', () => {
      expect(() => testBsvVersion('v1.5.4')).not.to.throw()
    })

    // ----------------------------------------------------------------------

    it('bsv 2.x throws an error', () => {
      const error = 'Run requires version 1.x of the bsv library'
      expect(() => testBsvVersion('2.0.0')).to.throw(error)
      expect(() => testBsvVersion('v2.0.0')).to.throw(error)
    })

    // ----------------------------------------------------------------------

    it('invalid bsv version throws an error', () => {
      const error = 'Run requires version 1.x of the bsv library'
      expect(() => testBsvVersion('0.1')).to.throw(error)
      expect(() => testBsvVersion(undefined)).to.throw(error)
    })
  })

  // ------------------------------------------------------------------------
  // node
  // ------------------------------------------------------------------------

  describe('node', () => {
    if (typeof window !== 'undefined') return

    function testNodeVersion (version) {
      const oldVersionDesc = Object.getOwnPropertyDescriptor(process, 'version')
      try {
        Object.defineProperty(process, 'version', {
          value: version,
          writable: false,
          enumerable: true,
          configurable: true
        })
        _check()
      } finally {
        Object.defineProperty(process, 'version', oldVersionDesc)
      }
    }

    // ----------------------------------------------------------------------

    it('node 10-16 supported', () => {
      testNodeVersion('v10.15.3')
      testNodeVersion('v11.15.0')
      testNodeVersion('v12.3.1')
      testNodeVersion('v13.11.0')
      testNodeVersion('v14.15.1')
      testNodeVersion('v15.3.0')
      testNodeVersion('v16.1.0')
      testNodeVersion('v18.12.1')
    })

    // ----------------------------------------------------------------------

    it('node > 18 not supported', () => {
      const error = 'Run is supported only from Node 10 to Node 18'
      expect(() => testNodeVersion('v19.0.0')).to.throw(error)
    })

    // ----------------------------------------------------------------------

    it('node < 10 not supported', () => {
      const error = 'Run is supported only from Node 10 to Node 18'
      expect(() => testNodeVersion('v9.11.2')).to.throw(error)
      expect(() => testNodeVersion('v8.16.0')).to.throw(error)
    })
  })

  // ------------------------------------------------------------------------
  // browser
  // ------------------------------------------------------------------------

  describe('browser', () => {
    if (typeof window === 'undefined') return

    it('IE not supported', () => {
      const oldNavigatorDesc = Object.getOwnPropertyDescriptor(window, 'navigator')
      try {
        Object.defineProperty(window, 'navigator', {
          value: { userAgent: 'MSIE: 8.1', platform: '', appVersion: '' },
          configurable: true,
          enumerable: true,
          writable: true
        })
        const error = 'Run is not supported on Internet Explorer. Please upgrade to Edge.'
        expect(() => _check()).to.throw(error)
      } finally {
        Object.defineProperty(window, 'navigator', oldNavigatorDesc)
      }
    })

    // ----------------------------------------------------------------------

    it('iOS <= 12 not supported', () => {
      const oldNavigatorDesc = Object.getOwnPropertyDescriptor(window, 'navigator')
      try {
        Object.defineProperty(window, 'navigator', {
          value: { platform: 'iPhone', appVersion: 'OS 12_0', userAgent: '' },
          configurable: true,
          enumerable: true,
          writable: true
        })
        const error = 'Run is not supported on this iOS version. Please upgrade to iOS 13 or above.'
        expect(() => _check()).to.throw(error)
      } finally {
        Object.defineProperty(window, 'navigator', oldNavigatorDesc)
      }
    })
  })
})
