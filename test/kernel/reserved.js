/**
 * reserved.js
 *
 * Tests for reserved words
 */

const { describe, it, afterEach } = require('mocha')
require('chai').use(require('chai-as-promised'))
const { expect } = require('chai')
const Run = require('../env/run')
const { Jig, Berry } = Run
const { LocalCache } = Run.plugins

// ------------------------------------------------------------------------------------------------
// Reserved
// ------------------------------------------------------------------------------------------------

describe('Reserved', () => {
  // Wait for every test to finish. This makes debugging easier.
  afterEach(() => Run.instance && Run.instance.sync())
  // Deactivate the current run instance. This stops leaks across tests.
  afterEach(() => Run.instance && Run.instance.deactivate())

  // --------------------------------------------------------------------------
  // Deploy
  // --------------------------------------------------------------------------

  describe('Deploy', () => {
    it('may override instance bindings on sidekick', () => {
      const run = new Run()
      run.deploy(class A { location () { }})
      run.deploy(class A { origin () { }})
      run.deploy(class A { nonce () { }})
      run.deploy(class A { owner () { }})
      run.deploy(class A { satoshis () { }})
    })

    // ------------------------------------------------------------------------

    it('may override auth method on jig', async () => {
      const run = new Run()
      class A extends Jig { auth () { this.n = 1 } }
      const a = new A()
      a.auth()
      expect(a.n).to.equal(1)
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      expect(a2.n).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('may override destroy method on jig', async () => {
      const run = new Run()
      class A extends Jig { destroy () { this.destroyed = true; super.destroy() } }
      const a = new A()
      a.destroy()
      expect(a.destroyed).to.equal(true)
      await run.sync()
      expect(a.location.endsWith('_d0')).to.equal(true)
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      expect(a2.destroyed).to.equal(true)
      expect(a2.location.endsWith('_d0')).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('may override sync method on berry', () => {
      const run = new Run()
      run.deploy(class B extends Berry { sync () { } })
    })

    // ------------------------------------------------------------------------

    it('may override auth method on berry', () => {
      const run = new Run()
      run.deploy(class B extends Berry { auth () { } })
    })

    // ------------------------------------------------------------------------

    it('may override destroy method on berry', () => {
      const run = new Run()
      run.deploy(class B extends Berry { destroy () { } })
    })

    // ------------------------------------------------------------------------

    it('throws if code has deps method', () => {
      const run = new Run()
      class A { static deps () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has toString method', () => {
      const run = new Run()
      class A { static toString () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has toString property', () => {
      const run = new Run()
      class A { }
      A.toString = 1
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has upgrade method', () => {
      const run = new Run()
      class A { static upgrade () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has upgrade property', () => {
      const run = new Run()
      class A { }
      A.upgrade = function upgrade () { }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has sync method', () => {
      const run = new Run()
      class A { static sync () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has sync property', () => {
      const run = new Run()
      class A { }
      A.sync = undefined
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has auth method', () => {
      const run = new Run()
      class A { static auth () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has auth property', () => {
      const run = new Run()
      class A { }
      A.auth = 1
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has destroy method', () => {
      const run = new Run()
      class A { static destroy () { } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has destroy property', () => {
      const run = new Run()
      class A { }
      A.destroy = 1
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has init method', () => {
      const run = new Run()
      class A { static init () { } }
      expect(() => run.deploy(A)).to.throw('Must not have any reserved words: init')
    })

    // ------------------------------------------------------------------------

    it('throws if code has init property', () => {
      const run = new Run()
      class A extends Jig { }
      A.init = 123
      expect(() => run.deploy(A)).to.throw('Must not have any reserved words: init')
    })

    // ------------------------------------------------------------------------

    it('throws if code has bindings methods', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Jig { static origin () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static location () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static nonce () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static owner () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static satoshis () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if jig has bindings methods', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Jig { origin () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { location () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { nonce () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { owner () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { satoshis () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if jig has sync method', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Jig { sync () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as method on code', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Jig { static latest () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static recent () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static mustBeLatest () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static mustBeRecent () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static checkForUpdates () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static encryption () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static blockhash () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static blocktime () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static blockheight () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static load () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static restricts () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static consume () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as method on jig', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Jig { latest () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { recent () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { mustBeLatest () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { mustBeRecent () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { encryption () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { blockhash () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { blocktime () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { blockheight () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { consume () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { eject () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as prop on code', () => {
      const run = new Run()
      class A { }
      A.latest = 1
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if override hasInstance on code', () => {
      const run = new Run()
      expect(() => run.deploy(class A { static [Symbol.hasInstance] () { } })).to.throw()
      expect(() => run.deploy(class A extends Jig { static [Symbol.hasInstance] () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if bindings on berry', () => {
      const run = new Run()
      expect(() => run.deploy(class A extends Berry { location () { } })).to.throw()
      expect(() => run.deploy(class A extends Berry { origin () { } })).to.throw()
      expect(() => run.deploy(class A extends Berry { nonce () { } })).to.throw()
      expect(() => run.deploy(class A extends Berry { owner () { } })).to.throw()
      expect(() => run.deploy(class A extends Berry { satoshis () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has deps property', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { deps: {} } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has presets property', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { presets: {} } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has toString property', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { toString: function toString () { } } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has upgrade property', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { upgrade: undefined } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has sync property', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { sync: 1 } }
      expect(() => run.deploy(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if presets has reserved props', () => {
      const run = new Run()
      const network = run.blockchain.network
      class A { }
      A.presets = { [network]: { encryption: 1 } }
      expect(() => run.deploy(A)).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // Upgrade
  // --------------------------------------------------------------------------

  describe('Upgrade', () => {
    it('may override auth method on jig', () => {
      const run = new Run()
      const O = run.deploy(class O extends Jig { })
      class A extends Jig { auth () { } }
      O.upgrade(A)
    })

    // ------------------------------------------------------------------------

    it('may override destroy method on jig', () => {
      const run = new Run()
      const O = run.deploy(class O extends Jig { })
      class A extends Jig { destroy () { } }
      O.upgrade(A)
    })

    // ------------------------------------------------------------------------

    it('throws if code has deps method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static deps () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has toString method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static toString () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has toString property', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.toString = 1
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has upgrade method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static upgrade () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has upgrade property', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.upgrade = function upgrade () { }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has sync method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static sync () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has sync property', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.sync = undefined
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has auth method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static auth () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has auth property', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.auth = []
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has destroy method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { static destroy () { } }
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has destroy property', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.destroy = 'false'
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if code has bindings methods', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A extends Jig { static origin () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static location () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static nonce () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static owner () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static satoshis () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if jig has bindings methods', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A extends Jig { origin () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { location () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { nonce () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { owner () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { satoshis () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if jig has sync method', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A extends Jig { sync () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as method on code', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A { static latest () { } })).to.throw()
      expect(() => O.upgrade(class A { static recent () { } })).to.throw()
      expect(() => O.upgrade(class A { static mustBeLatest () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static mustBeRecent () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static encryption () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static blockhash () { } })).to.throw()
      expect(() => O.upgrade(class A extends Berry { static blocktime () { } })).to.throw()
      expect(() => O.upgrade(class A extends Berry { static blockheight () { } })).to.throw()
      expect(() => O.upgrade(class A extends Berry { static load () { } })).to.throw()
      expect(() => O.upgrade(class A extends Berry { static delegate () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as method on jig', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A extends Jig { latest () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { recent () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { mustBeLatest () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { mustBeRecent () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { encryption () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { blockhash () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { blocktime () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { blockheight () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { load () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { restricts () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { makeBackup () { } })).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if reserved prop as prop on code', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      class A { }
      A.latest = 1
      expect(() => O.upgrade(A)).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if override hasInstance on code', () => {
      const run = new Run()
      const O = run.deploy(class O { })
      expect(() => O.upgrade(class A { static [Symbol.hasInstance] () { } })).to.throw()
      expect(() => O.upgrade(class A extends Jig { static [Symbol.hasInstance] () { } })).to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // defineProperty
  // --------------------------------------------------------------------------

  describe('defineProperty', () => {
    it('throws if define reserved code method on code', () => {
      const run = new Run()
      class A extends Jig {
        static f (name) {
          const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(this, name, desc)
        }
      }
      const C = run.deploy(A)
      expect(() => C.f('toString')).to.throw('Cannot define toString')
      expect(() => C.f('load')).to.throw('Cannot define load')
      expect(() => C.f('auth')).to.throw('Cannot define auth')
      expect(() => C.f('destroy')).to.throw('Cannot define destroy')
    })

    // ------------------------------------------------------------------------

    it('throws if define reserved prop on code', () => {
      const run = new Run()
      class A extends Jig {
        static f (name) {
          const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(this, name, desc)
        }
      }
      const C = run.deploy(A)
      expect(() => C.f('makeBackup')).to.throw('Cannot define makeBackup')
      expect(() => C.f('delegate')).to.throw('Cannot define delegate')
    })

    // ------------------------------------------------------------------------

    it('throws if define reserved jig method on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f (prop) {
          const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(this, prop, desc)
        }
      }
      const a = new A()
      expect(() => a.f('sync')).to.throw('Cannot define sync')
    })

    // ------------------------------------------------------------------------

    it('throws if define reserved prop on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f (prop) {
          const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(this, prop, desc)
        }
      }
      const a = new A()
      expect(() => a.f('blocktime')).to.throw('Cannot define blocktime')
      expect(() => a.f('recover')).to.throw('Cannot define recover')
    })

    // ------------------------------------------------------------------------

    it('throws if define reserved prop on berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry {
        init (prop) {
          const desc = { configurable: true, enumerable: true, writable: true, value: 1 }
          Object.defineProperty(this, prop, desc)
        }

        static async pluck (prop) { return new B(prop) }
      }
      await expect(B.load('encryption')).to.be.rejectedWith('Cannot define encryption')
      await expect(B.load('checkForUpdates')).to.be.rejectedWith('Cannot define checkForUpdates')
      await expect(B.load('eject')).to.be.rejectedWith('Cannot define eject')
    })
  })

  // --------------------------------------------------------------------------
  // delete
  // --------------------------------------------------------------------------

  describe('delete', () => {
    it('throws if delete reserved code method on code', () => {
      const run = new Run()
      class A extends Jig {
        static f (prop) { delete this[prop] }
      }
      const CA = run.deploy(A)
      expect(() => CA.f('sync')).to.throw('Cannot delete sync')
      expect(() => CA.f('load')).to.throw('Cannot delete load')
    })

    // ------------------------------------------------------------------------

    it('throws if delete reserved prop on code', () => {
      const run = new Run()
      class A extends Jig {
        static f (prop) { delete this[prop] }
      }
      const CA = run.deploy(A)
      expect(() => CA.f('blockhash')).to.throw('Cannot delete blockhash')
      expect(() => CA.f('consume')).to.throw('Cannot delete consume')
      expect(() => CA.f('armoured')).to.throw('Cannot delete armoured')
    })

    // ------------------------------------------------------------------------

    it('throws if delete reserved jig method on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f (prop) { delete this[prop] }
      }
      const a = new A()
      expect(() => a.f('sync')).to.throw('Cannot delete sync')
    })

    // ------------------------------------------------------------------------

    it('throws if delete reserved prop on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig {
        f (prop) { delete this[prop] }
      }
      const a = new A()
      expect(() => a.f('blockheight')).to.throw('Cannot delete blockheight')
      expect(() => a.f('restricts')).to.throw('Cannot delete restricts')
    })

    // ------------------------------------------------------------------------

    it('throws if delete reserved prop on berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry {
        init (prop) { delete this[prop] }
        static async pluck (prop) { return new B(prop) }
      }
      await expect(B.load('encryption')).to.be.rejectedWith('Cannot delete encryption')
      await expect(B.load('makeBackup')).to.be.rejectedWith('Cannot delete makeBackup')
    })

    // ------------------------------------------------------------------------

    it('may delete reserved prop on inner object', () => {
      const run = new Run()
      class A extends Jig {
        static f (prop) {
          delete this.s[prop]
        }
      }
      A.s = new Set()
      const CA = run.deploy(A)
      CA.f('sync')
      CA.f('encryption')
      CA.f('recover')
    })
  })

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe('get', () => {
    it('throws if get reserved prop on jig externally', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      expect(() => a.encryption).to.throw('Cannot get encryption')
      expect(() => a.recover).to.throw('Cannot get recover')
      expect(() => a.latest).to.throw('Cannot get latest')
    })

    // ------------------------------------------------------------------------

    it('throws if get reserved prop on jig internally', () => {
      new Run() // eslint-disable-line
      class A extends Jig { f (prop) { this[prop] } } // eslint-disable-line
      const a = new A()
      expect(() => a.f('blocktime')).to.throw('Cannot get blocktime')
      expect(() => a.f('mustBeRecent')).to.throw('Cannot get mustBeRecent')
      expect(() => a.f('delegate')).to.throw('Cannot get delegate')
    })

    // ------------------------------------------------------------------------

    it('throws if get reserved prop on code', () => {
      const run = new Run()
      class A { static f (prop) { return this[prop] } }
      const CA = run.deploy(A)
      expect(() => CA.f('blockhash')).to.throw('Cannot get blockhash')
      expect(() => CA.f('recent')).to.throw('Cannot get recent')
      expect(() => CA.f('consume')).to.throw('Cannot get consume')
    })

    // ------------------------------------------------------------------------

    it('throws if get reserved prop on berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { }
      const b = await B.load('abc')
      expect(() => b.encryption).to.throw('Cannot get encryption')
      expect(() => b.recent).to.throw('Cannot get recent')
    })

    // ------------------------------------------------------------------------

    it('may get reserved prop on inner object', () => {
      new Run() //eslint-disable-line
      class A extends Jig {
        init () { this.o = { } }
        f (prop) { return this.o[prop] }
      }
      const a = new A()
      a.f('latest')
      a.f('recover')
    })
  })

  // --------------------------------------------------------------------------
  // getOwnPropertyDescriptor
  // --------------------------------------------------------------------------

  describe('getOwnPropertyDescriptor', () => {
    it('throws if get descriptor for reserved prop on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      expect(() => Object.getOwnPropertyDescriptor(a, 'blockheight')).to.throw('Cannot get descriptor for blockheight')
      expect(() => Object.getOwnPropertyDescriptor(a, 'consume')).to.throw('Cannot get descriptor for consume')
      expect(() => Object.getOwnPropertyDescriptor(a, 'armored')).to.throw('Cannot get descriptor for armored')
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor for reserved prop on code externally', () => {
      const run = new Run()
      class A { }
      const CA = run.deploy(A)
      expect(() => Object.getOwnPropertyDescriptor(CA, 'blockhash')).to.throw('Cannot get descriptor for blockhash')
      expect(() => Object.getOwnPropertyDescriptor(CA, 'eject')).to.throw('Cannot get descriptor for eject')
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor for reserved prop on code internally', () => {
      const run = new Run()
      class A extends Jig { static f (prop) { return Object.getOwnPropertyDescriptor(this, prop) } }
      const CA = run.deploy(A)
      expect(() => CA.f('blocktime')).to.throw('Cannot get descriptor for blocktime')
      expect(() => CA.f('replicate')).to.throw('Cannot get descriptor for replicate')
    })

    // ------------------------------------------------------------------------

    it('throws if get descriptor for reserved prop on berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { }
      const b = await B.load('abc')
      expect(() => Object.getOwnPropertyDescriptor(b, 'mustBeLatest')).to.throw('Cannot get descriptor for mustBeLatest')
      expect(() => Object.getOwnPropertyDescriptor(b, 'makeBackup')).to.throw('Cannot get descriptor for makeBackup')
      expect(() => Object.getOwnPropertyDescriptor(b, 'armoured')).to.throw('Cannot get descriptor for armoured')
    })

    // ------------------------------------------------------------------------

    it('may get descriptor for reserved prop on inner object', () => {
      const run = new Run()
      class A extends Jig { }
      A.b = new Uint8Array()
      const CA = run.deploy(A)
      expect(() => CA.b.encryption).not.to.throw()
      expect(() => CA.b.restricts).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // has
  // --------------------------------------------------------------------------

  describe('has', () => {
    it('throws if check reserved prop on jig externally', async () => {
      new Run() // eslint-disable-line
      class A extends Jig { }
      const a = new A()
      await a.sync()
      expect(() => 'encryption' in a).to.throw('Cannot check encryption')
      expect(() => 'recover' in a).to.throw('Cannot check recover')
    })

    // ------------------------------------------------------------------------

    it('throws if check reserved prop on jig internally', () => {
      new Run() // eslint-disable-line
      class A extends Jig { f (prop) { return prop in this } }
      const a = new A()
      expect(() => a.f('recent')).to.throw('Cannot check recent')
      expect(() => a.f('mustBeRecent')).to.throw('Cannot check mustBeRecent')
    })

    // ------------------------------------------------------------------------

    it('throws if check reserved prop on code', () => {
      const run = new Run()
      class A extends Jig {
        static f (prop) { return prop in this }
      }
      const CA = run.deploy(A)
      expect(() => CA.f('recent')).to.throw('Cannot check recent')
      expect(() => CA.f('consume')).to.throw('Cannot check consume')
    })

    // ------------------------------------------------------------------------

    it('throws if check reserved prop on berry', async () => {
      const run = new Run()
      class B extends Berry { }
      const CB = run.deploy(B)
      await run.sync()
      const b = await CB.load('123')
      expect(() => 'replicate' in b).to.throw('Cannot check replicate')
      expect(() => 'delegate' in b).to.throw('Cannot check delegate')
    })

    // ------------------------------------------------------------------------

    it('may get reserved prop on inner object', () => {
      const run = new Run()
      function f () { }
      const cf = run.deploy(f)
      expect(() => 'mustBeLatest' in cf.deps).not.to.throw()
      expect(() => 'latest' in cf.deps).not.to.throw()
    })
  })

  // --------------------------------------------------------------------------
  // set
  // --------------------------------------------------------------------------

  describe('set', () => {
    it('may set auth property on jig', async () => {
      const run = new Run()
      class A extends Jig { f () { this.auth = 1 } }
      const a = new A()
      a.f()
      expect(a.auth).to.equal(1)
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      expect(a2.auth).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('may set destroy property on jig', async () => {
      const run = new Run()
      function destroy () { }
      class A extends Jig { f () { this.destroy = destroy } }
      A.deps = { destroy }
      const a = new A()
      a.f()
      expect(a.destroy instanceof Run.Code).to.equal(true)
      await run.sync()
      run.cache = new LocalCache()
      const a2 = await run.load(a.location)
      expect(a2.destroy instanceof Run.Code).to.equal(true)
    })

    // ------------------------------------------------------------------------

    it('may set presets on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.presets = 'abc' } }
      const C = run.deploy(A)
      C.f()
      expect(C.presets).to.equal('abc')
    })

    // ------------------------------------------------------------------------

    it('throws if set reserved props on code', () => {
      const run = new Run()
      class A extends Jig { static f (x) { this[x] = 1 } }
      const C = run.deploy(A)
      expect(() => C.f('encryption')).to.throw()
      expect(() => C.f('latest')).to.throw()
      expect(() => C.f('blocktime')).to.throw()
      expect(() => C.f('restricts')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if set reserved props on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { f (x) { this[x] = 1 } }
      const a = new A()
      expect(() => a.f('encryption')).to.throw()
      expect(() => a.f('latest')).to.throw()
      expect(() => a.f('blocktime')).to.throw()
      expect(() => a.f('replicate')).to.throw()
    })

    // ------------------------------------------------------------------------

    it('throws if set upgrade on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.upgrade = {} } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set upgrade')
    })

    // ------------------------------------------------------------------------

    it('throws if set sync on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.sync = A.sync } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set sync')
    })

    // ------------------------------------------------------------------------

    it('throws if set load on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.load = 1 } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set load')
    })

    // ------------------------------------------------------------------------

    it('throws if set init on jig', () => {
      new Run() // eslint-disable-line
      class A extends Jig { f () { this.init = 1 } }
      const a = new A()
      expect(() => a.f()).to.throw('Cannot set init')
    })

    // ------------------------------------------------------------------------

    it('throws if set sync on jig', () => {
      new Run() // eslint-disable-line
      function sync () { }
      class A extends Jig { f () { this.sync = sync } }
      A.deps = { sync }
      const a = new A()
      expect(() => a.f()).to.throw('Cannot set sync')
    })

    // ------------------------------------------------------------------------

    it('throws if set auth on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.auth = 1 } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set auth')
    })

    // ------------------------------------------------------------------------

    it('throws if set destroy on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.destroy = undefined } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set destroy')
    })

    // ------------------------------------------------------------------------

    it('throws if set deps on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.deps = 123 } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set deps')
    })

    // ------------------------------------------------------------------------

    it('throws if set toString on code', () => {
      const run = new Run()
      class A extends Jig { static f () { this.toString = false } }
      const C = run.deploy(A)
      expect(() => C.f()).to.throw('Cannot set toString')
    })

    // ------------------------------------------------------------------------

    it('throws if set reserved prop on berry', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.checkForUpdates = true } }
      await expect(B.load('abc')).to.be.rejectedWith('Cannot set checkForUpdates')
    })
  })

  // --------------------------------------------------------------------------
  // Pluck
  // --------------------------------------------------------------------------

  describe('Pluck', () => {
    it('may set sync during pluck', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.sync = 1 } }
      const b = await B.load('abc')
      expect(b.sync).to.equal(1)
    })

    // ------------------------------------------------------------------------

    it('may set auth during pluck', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.auth = [] } }
      const b = await B.load('abc')
      expect(b.auth).to.deep.equal([])
    })

    // ------------------------------------------------------------------------

    it('may set destroy during pluck', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.destroy = null } }
      const b = await B.load('abc')
      expect(b.destroy).to.deep.equal(null)
    })

    // ------------------------------------------------------------------------

    it('throws if set location bindings during pluck', async () => {
      new Run() // eslint-disable-line
      class B extends Berry { init () { this.location = 'abc' } }
      await expect(B.load('abc')).to.be.rejectedWith('Cannot set location')
      class C extends Berry { init () { this.origin = 'abc' } }
      await expect(C.load('abc')).to.be.rejectedWith('Cannot set origin')
      class D extends Berry { init () { this.nonce = 0 } }
      await expect(D.load('abc')).to.be.rejectedWith('Cannot set nonce')
    })
  })
})

// ------------------------------------------------------------------------------------------------
