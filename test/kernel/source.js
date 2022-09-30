/**
 * source.js
 *
 * Tests for lib/kernel/source.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { _sandbox, _anonymize, _deanonymize, _check } = unmangle(unmangle(Run)._source)

// ----------------------------------------------------------------------------------------------
// Source
// ----------------------------------------------------------------------------------------------

describe('Source', () => {
  // ----------------------------------------------------------------------------------------------
  // _sandbox
  // ----------------------------------------------------------------------------------------------

  describe('_sandbox', () => {
    // Node 8 and Node 12 have slightly different spacing for getNormalizedSourceCode('function () { return 1 }')
    // We don't need the normalized code to always be exactly the same, as long as it functions the same.
    // Compiled build also add semicolons, so we normlize that too.

    function expectNormalizedSourceCode (T, src) {
      const normalize = s => s.replace(/\s+/g, '').replace(/;/g, '')
      const sandboxSrc = _sandbox(T.toString(), T)
      expect(normalize(sandboxSrc)).to.equal(normalize(src))
    }

    // ------------------------------------------------------------------------

    it('basic class', () => {
      class A {}
      expectNormalizedSourceCode(A, 'class A {}')
    })

    // ------------------------------------------------------------------------

    it('basic function', () => {
      function f () { return 1 }
      expectNormalizedSourceCode(f, 'function f() { return 1 }')
    })

    // ------------------------------------------------------------------------

    it('class that extends another class', () => {
      const SomeLibrary = { B: class B { } }
      class A extends SomeLibrary.B {}
      expectNormalizedSourceCode(A, 'class A extends B {}')
    })

    // ------------------------------------------------------------------------

    it('single-line class', () => {
      class B { }
      class A extends B { f () {} }
      expectNormalizedSourceCode(A, 'class A extends B { f () {} }')
    })

    // ------------------------------------------------------------------------

    it('method', () => {
      class B { f () { } }
      expectNormalizedSourceCode(B.prototype.f, 'function f () { }')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _anonymize
  // ----------------------------------------------------------------------------------------------

  describe('_anonymize', () => {
    it('anonymizes', () => {
      expect(_anonymize('class A { }')).to.equal('class  { }')
      expect(_anonymize('class A{f(){}}')).to.equal('class {f(){}}')
      expect(_anonymize('class A extends B { }')).to.equal('class  extends B { }')
      expect(_anonymize('function f() { }')).to.equal('function () { }')
      expect(_anonymize('function f    () {\n}')).to.equal('function     () {\n}')
      expect(_anonymize('class A extends SomeLibrary.B { }')).to.equal('class  extends SomeLibrary.B { }')
      expect(_anonymize('class A extends C["B"] { }')).to.equal('class  extends C["B"] { }')
    })

    // ------------------------------------------------------------------------

    it('throws if bad source', () => {
      expect(() => _anonymize('hello world')).to.throw('Bad source code')
      expect(() => _anonymize('() => { }')).to.throw('Bad source code')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _deanonymize
  // ----------------------------------------------------------------------------------------------

  describe('_deanonymize', () => {
    it('deanonymizes', () => {
      expect(_deanonymize('class { }', 'A')).to.equal('class A{ }')
      expect(_deanonymize('class  extends B{ }', 'A')).to.equal('class A extends B{ }')
      expect(_deanonymize('function () { }', 'f')).to.equal('function f() { }')
    })

    // ------------------------------------------------------------------------

    it('same after anonymize and deanonymize', () => {
      function test (x, n) { expect(_deanonymize(_anonymize(x), n)).to.equal(x) }
      test('class A { }', 'A')
      test('class A{ }', 'A')
      test('class A extends C { }', 'A')
      test('class A extends C\n{ }', 'A')
      test('class A extends C{ }', 'A')
      test('function f() { }', 'f')
      test('function f () { }', 'f')
      test('function f () {\n}', 'f')
    })

    // ------------------------------------------------------------------------

    it('throws if bad source', () => {
      expect(() => _deanonymize('hello world', '')).to.throw('Bad source code')
      expect(() => _deanonymize('() => { }', '')).to.throw('Bad source code')
      expect(() => _deanonymize('class{}', '')).to.throw('Bad source code')
    })
  })

  // ----------------------------------------------------------------------------------------------
  // _check
  // ----------------------------------------------------------------------------------------------

  describe('_check', () => {
    it('simple types', () => {
      _check('class A{}')
      _check('class A extends B{}')
      _check('function f(){}')
    })

    // ------------------------------------------------------------------------

    it('spacing and new lines', () => {
      _check('   \nclass \nA \n{\n }\n  \n')
      _check('class   A extends B{\nset(x) { this.n = 1 } }')
      _check('\nfunction\nf(   a \n ,   \n b, \b ){ \n}\n')
    })

    // ------------------------------------------------------------------------

    it('inner definitions', () => {
      _check('class A { init() { class B { } } }')
      _check('function f() { function g() { } function h() { } }')
    })

    // ------------------------------------------------------------------------

    it('comments', () => {
      _check('class A { /*}; class B {*/ }')
      _check('function f() {\n//}function g() {\n}')
    })

    // ------------------------------------------------------------------------

    it('strings', () => {
      _check('class A { \'}; class B {*\' }')
      _check('function f() {"//}function g() {"}')
      _check('class A extends B{\n`};\nclass C{}`}')
    //   _check('class A { \'}\' }')
    //   _check('class A { "{" }')
    //   _check('class A { \'}\' }')
    })

    // ------------------------------------------------------------------------

    it('throws if comments in declaration', () => {
      const bad = src => expect(() => _check(src)).to.throw(`Bad source code: ${src}`)
      bad('class A // dwokfnwofkn\n{}')
      bad('class A extends /*C*/ B { }')
      bad('class A /*class B {}*/ { }')
      bad('class \nA \n/*class \nB {}\n*/ { }')
    })

    // ------------------------------------------------------------------------

    it('throws if not a definition', () => {
      const bad = src => expect(() => _check(src)).to.throw(`Bad source code: ${src}`)
      bad('1')
      bad('1 + 2')
      bad('')
      bad('null')
      bad('{}')
      bad('"1 2 3"')
      bad('`class A { }`')
      bad('while(true){}')
    })

    // ------------------------------------------------------------------------

    it('throws if invalid definition', () => {
      const bad = src => expect(() => _check(src)).to.throw(`Bad source code: ${src}`)
      bad('function() { }')
      bad('class { }')
      bad('class A {')
      bad('function f() }')
      bad('function f {}')
      bad('class A ex B { }')
      bad('(class A{})')
      bad('[function f(){}]')
      bad('{}; class A {}')
      bad('class A extends B extends C {}')
    })

    // ------------------------------------------------------------------------

    it('throws if multiple definitions', () => {
      const bad = src => expect(() => _check(src)).to.throw(`Multiple definitions not permitted: ${src}`)
      bad('class A{}; class B{}')
      bad('class A{}\nclass B{}\nclass C{}')
      bad('function f(){}; function g(){}')
    })
  })
})

// ------------------------------------------------------------------------------------------------
