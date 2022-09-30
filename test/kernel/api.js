/**
 * api.js
 *
 * Tests for lib/kernel/api.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { NotImplementedError } = Run.errors
const { Blockchain, Purse, Logger, Cache, Lock, Owner, State } = Run.api

// ------------------------------------------------------------------------------------------------
// Blockchain API
// ------------------------------------------------------------------------------------------------

describe('Blockchain API', () => {
  describe('broadcast', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Blockchain().broadcast()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('fetch', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Blockchain().fetch()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('utxos', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Blockchain().utxos()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('time', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Blockchain().time()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('spends', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Blockchain().spends()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('network', () => {
    it('throws NotImplementedError by default', async () => {
      expect(() => new Blockchain().network).to.throw(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if all required properties are present', () => {
      const blockchain = {
        broadcast: () => {},
        fetch: () => {},
        utxos: () => {},
        time: () => {},
        spends: () => {},
        network: 'test'
      }
      expect(blockchain instanceof Blockchain).to.equal(true)
      expect(Object.assign(() => {}, blockchain) instanceof Blockchain).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if required property is missing', () => {
      const blockchain = {
        broadcast: () => {},
        fetch: () => {},
        utxos: () => {},
        time: () => {},
        spends: () => {},
        network: 'test'
      }
      expect(Object.assign({}, blockchain, { broadcast: undefined }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { fetch: undefined }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { utxos: undefined }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { time: undefined }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { spends: undefined }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { network: undefined }) instanceof Blockchain).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if required properties have wrong types', () => {
      const blockchain = { broadcast: () => {}, fetch: () => {}, utxos: () => {}, network: 'test' }
      expect(Object.assign({}, blockchain, { broadcast: 'method' }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { fetch: 123 }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { utxos: null }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { time: {} }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { spends: 'abc' }) instanceof Blockchain).to.equal(false)
      expect(Object.assign({}, blockchain, { network: () => {} }) instanceof Blockchain).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof Blockchain).to.equal(false)
      expect(true instanceof Blockchain).to.equal(false)
      expect('blockchain' instanceof Blockchain).to.equal(false)
      expect(null instanceof Blockchain).to.equal(false)
      expect(undefined instanceof Blockchain).to.equal(false)
      expect(Symbol.hasInstance instanceof Blockchain).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Cache API
// ------------------------------------------------------------------------------------------------

describe('Cache API', () => {
  describe('get', () => {
    it('does not throw by default', async () => {
      await expect(new Cache().get()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('set', () => {
    it('does not throw by default', async () => {
      await expect(new Cache().set()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if set and get functions are present', () => {
      expect(({ set: () => {}, get: () => {} }) instanceof Cache).to.equal(true)
      expect(Object.assign(() => {}, { set: () => {}, get: () => {} }) instanceof Cache).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if set and get are not functions', () => {
      expect(({ set: false, get: () => {} }) instanceof Cache).to.equal(false)
      expect(({ set: () => {}, get: null }) instanceof Cache).to.equal(false)
      expect(({ set: () => {} }) instanceof Cache).to.equal(false)
      expect(({ get: () => {} }) instanceof Cache).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof Cache).to.equal(false)
      expect(true instanceof Cache).to.equal(false)
      expect('blockchain' instanceof Cache).to.equal(false)
      expect(null instanceof Cache).to.equal(false)
      expect(undefined instanceof Cache).to.equal(false)
      expect(Symbol.hasInstance instanceof Cache).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Lock API
// ------------------------------------------------------------------------------------------------

describe('Lock API', () => {
  describe('script', () => {
    it('throws NotImplementedError by default', () => {
      expect(() => new Lock().script()).to.throw(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('domain', () => {
    it('throws NotImplementedError by default', () => {
      expect(() => new Lock().domain()).to.throw(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if script is a function on class', () => {
      class CustomLock {
        script () { return '' }
        domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns true if script returns a hex string', () => {
      class CustomLock {
        script () { return '01aac8ff' }
        domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if script is a getter', () => {
      class CustomLock {
        get script () { return '' }
        domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if script is a property', () => {
      class CustomLock {
        constructor () { this.script = '' }
        domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
      expect(({ script: null, domain: 1 }) instanceof Lock).to.equal(false)
      expect(({ script: '', domain: 1 }) instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if script is a getter on object', () => {
      expect(({
        script () { return '' },
        domain () { return 1 }
      }) instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns true if domain is a function on class', () => {
      class CustomLock {
        script () { return '' }
        domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if domain is a getter', () => {
      class CustomLock {
        script () { return '' }
        get domain () { return 1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if domain is a property', () => {
      class CustomLock {
        script () { return '' }
        domain () { return 123 }
      }
      const lock = new CustomLock()
      lock.domain = 1
      expect(lock instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if domain returns a non-number', () => {
      class CustomLock {
        script () { return '' }
        domain () { return null }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if domain returns a non-integer', () => {
      class CustomLock {
        script () { return '' }
        domain () { return 1.5 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if domain returns negative', () => {
      class CustomLock {
        script () { return '' }
        domain () { return -1 }
      }
      expect(new CustomLock() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if object overrides script getter', () => {
      class CustomLock { script () { return '' } }
      const o = { script: '' }
      Object.setPrototypeOf(o, CustomLock.prototype)
      expect(o instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if script is not a hex string', () => {
      class CustomLock1 { script () { return [1, 2, 3] } }
      class CustomLock2 { script () { return 'xy' } }
      expect(new CustomLock1() instanceof Lock).to.equal(false)
      expect(new CustomLock2() instanceof Lock).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof Lock).to.equal(false)
      expect(true instanceof Lock).to.equal(false)
      expect('blockchain' instanceof Lock).to.equal(false)
      expect(null instanceof Lock).to.equal(false)
      expect(undefined instanceof Lock).to.equal(false)
      expect(Symbol.hasInstance instanceof Lock).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Logger API
// ------------------------------------------------------------------------------------------------

describe('Logger API', () => {
  describe('info', () => {
    it('does not throw by default', () => {
      expect(() => new Logger().info()).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------

  describe('warn', () => {
    it('does not throw by default', () => {
      expect(() => new Logger().warn()).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------

  describe('debug', () => {
    it('does not throw by default', () => {
      expect(() => new Logger().debug()).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------

  describe('error', () => {
    it('does not throw by default', () => {
      expect(() => new Logger().error()).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true for any object for function', () => {
      expect(({}) instanceof Logger).to.equal(true)
      expect((() => {}) instanceof Logger).to.equal(true)
      expect(({ info: () => {} }) instanceof Logger).to.equal(true)
      expect(({ warn: function () { } }) instanceof Logger).to.equal(true)
      expect(({ debug: false }) instanceof Logger).to.equal(true)
      expect(({ error: null }) instanceof Logger).to.equal(true)
      const f = () => {}
      expect(({ error: f, info: f, warn: f, debug: f }) instanceof Logger).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect([] instanceof Logger).to.equal(false)
      expect(0 instanceof Logger).to.equal(false)
      expect(true instanceof Logger).to.equal(false)
      expect('blockchain' instanceof Logger).to.equal(false)
      expect(null instanceof Logger).to.equal(false)
      expect(undefined instanceof Logger).to.equal(false)
      expect(Symbol.hasInstance instanceof Logger).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Owner API
// ------------------------------------------------------------------------------------------------

describe('Owner API', () => {
  describe('sign', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Owner().sign()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('nextOwner', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Owner().nextOwner()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if nextOwner and sign are present', () => {
      expect(({ nextOwner: () => '', sign: () => {} }) instanceof Owner).to.equal(true)
      expect(Object.assign(() => {}, { nextOwner: () => [''], sign: () => {} }) instanceof Owner).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if sign is not a function', () => {
      expect(({ nextOwner: () => '' }) instanceof Owner).to.equal(false)
      expect(({ nextOwner: () => '', sign: 123 }) instanceof Owner).to.equal(false)
      expect(({ nextOwner: () => '', get sign () { } }) instanceof Owner).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false if nextOwner is not a function', () => {
      expect(({ sign: () => '' }) instanceof Owner).to.equal(false)
      expect(({ sign: () => '', nextOwner: 123 }) instanceof Owner).to.equal(false)
      expect(({ sign: () => '', get nextOwner () { } }) instanceof Owner).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof Owner).to.equal(false)
      expect(true instanceof Owner).to.equal(false)
      expect('blockchain' instanceof Owner).to.equal(false)
      expect(null instanceof Owner).to.equal(false)
      expect(undefined instanceof Owner).to.equal(false)
      expect(Symbol.hasInstance instanceof Owner).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// Purse API
// ------------------------------------------------------------------------------------------------

describe('Purse API ', () => {
  describe('pay', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Purse().pay()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new Purse().broadcast()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if pay method is present', () => {
      const purse = { pay: () => {} }
      expect(purse instanceof Purse).to.equal(true)
      expect(Object.assign(function () {}, purse) instanceof Purse).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if pay method is missing or invalid', () => {
      expect(({}) instanceof Purse).to.equal(false)
      expect((() => {}) instanceof Purse).to.equal(false)
      expect(({ pay: null }) instanceof Purse).to.equal(false)
      expect(({ pay: {} }) instanceof Purse).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof Purse).to.equal(false)
      expect(true instanceof Purse).to.equal(false)
      expect('blockchain' instanceof Purse).to.equal(false)
      expect(null instanceof Purse).to.equal(false)
      expect(undefined instanceof Purse).to.equal(false)
      expect(Symbol.hasInstance instanceof Purse).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
// State API
// ------------------------------------------------------------------------------------------------

describe('State API ', () => {
  describe('pull', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new State().pull()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('locations', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new State().locations()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('broadcast', () => {
    it('throws NotImplementedError by default', async () => {
      await expect(new State().broadcast()).to.be.rejectedWith(NotImplementedError)
    })
  })

  // --------------------------------------------------------------------------

  describe('instanceof', () => {
    it('returns true if pull method is present', () => {
      const state = { pull: () => {} }
      expect(state instanceof State).to.equal(true)
      expect(Object.assign(function () {}, state) instanceof State).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('returns false if pull method is missing or invalid', () => {
      expect(({}) instanceof State).to.equal(false)
      expect((() => {}) instanceof State).to.equal(false)
      expect(({ pay: null }) instanceof State).to.equal(false)
      expect(({ pay: new Set() }) instanceof State).to.equal(false)
    })

    // ------------------------------------------------------------------------

    it('returns false for non-objects', () => {
      expect(0 instanceof State).to.equal(false)
      expect(true instanceof State).to.equal(false)
      expect('blockchain' instanceof State).to.equal(false)
      expect(null instanceof State).to.equal(false)
      expect(undefined instanceof State).to.equal(false)
      expect(Symbol.hasInstance instanceof State).to.equal(false)
    })
  })
})

// ------------------------------------------------------------------------------------------------
