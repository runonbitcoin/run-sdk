/**
 * realm.js
 *
 * Deterministic realm
 */

const ses = require('./ses.json')
const { _makeDeterministic, _nonDeterministicIntrinsics, _stableJSONStringify } = require('./determinism')
const { _sudo } = require('./admin')
const { _uncover } = require('./source')

/* global VARIANT */

// ------------------------------------------------------------------------------------------------
// DeterministicRealm
// ------------------------------------------------------------------------------------------------

/**
 * A Realm implementation that is nearly deterministic
 */
class DeterministicRealm {
  constructor () {
    const makeDet = `var n=${_uncover(_stableJSONStringify.toString())};var m=${_uncover(_makeDeterministic.toString())};m(n);`
    const setup = `(()=>{
      ${ses};
      ${makeDet};
      SES.lockdown();
      var C = this.Compartment;
      delete this.SES;
      delete this.Compartment;
      return C
    })()`

    if (typeof VARIANT !== 'undefined' && VARIANT === 'browser') {
      // Create a hidden iframe to evaluate code. This creates a new browser realm.
      const iframe = document.createElement('iframe')
      if (!iframe.style) iframe.style = {}
      iframe.style.display = 'none'
      document.documentElement.appendChild(iframe)

      // Grab the code evaluator
      this.iframeEval = iframe.contentWindow.eval

      // Secure the realm
      this.Compartment = this.iframeEval(setup)
    } else {
      const vm = require('vm')
      this.Compartment = vm.runInNewContext(setup)
    }

    // Each non-deterministic global is disabled
    this.globalOverrides = {}
    _nonDeterministicIntrinsics.forEach(name => { this.globalOverrides[name] = undefined })

    // We also overwrite console so that console.log in sandboxed code is relogged outside
    const consoleCode = `
      const o = { }
      Object.keys(c).forEach(name => {
        o[name] = (...args) => s(() => c[name](...args))
      })
      o
    `
    const consoleCompartment = this._makeNondeterministicCompartment()
    consoleCompartment.global.c = console
    consoleCompartment.global.s = _sudo
    this.globalOverrides.console = consoleCompartment.evaluate(consoleCode)
  }

  makeCompartment () {
    const compartment = this._makeNondeterministicCompartment()

    Object.assign(compartment.global, this.globalOverrides)

    const global = new Proxy({}, {
      set: (target, prop, value) => {
        target[prop] = compartment.global[prop] = value
        return true
      },
      deleteProperty: (target, prop) => {
        delete target[prop]
        if (prop in this.globalOverrides) {
          compartment.global[prop] = this.globalOverrides[prop]
        } else {
          delete compartment.global[prop]
        }
        return true
      },
      defineProperty: (target, prop, descriptor) => {
        Object.defineProperty(target, prop, descriptor)
        Object.defineProperty(compartment.global, prop, descriptor)
        return true
      }
    })

    const evaluate = src => {
      this._checkDeterministic(src)
      return compartment.evaluate(src)
    }

    return { evaluate, global }
  }

  _makeNondeterministicCompartment () {
    return new this.Compartment()
  }

  _checkDeterministic (src) {
    const FOR_IN_REGEX = /for\s*\([^)]+\s+in\s+\S+\)/g
    if (FOR_IN_REGEX.test(src)) throw new Error('for-in loops are not supported')
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = DeterministicRealm
