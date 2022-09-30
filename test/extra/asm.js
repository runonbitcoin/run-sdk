/**
 * asm.js
 *
 * Tests for lib/extra/asm.js
 */

const { describe, it } = require('mocha')
const { expect } = require('chai')
const bsv = require('bsv')
const Run = require('../env/run')
const { asm } = Run.extra.test

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

function hex (x) { return Buffer.from(x).toString('hex') }

// ------------------------------------------------------------------------------------------------
// asm
// ------------------------------------------------------------------------------------------------

describe('asm', () => {
  it('numeric opcodes', () => {
    expect(asm('0')).to.equal(hex([asm.OP_CODES.OP_0]))
    expect(asm('1')).to.equal(hex([asm.OP_CODES.OP_1]))
    expect(asm('8')).to.equal(hex([asm.OP_CODES.OP_8]))
    expect(asm('a')).to.equal(hex([asm.OP_CODES.OP_10]))
    expect(asm('10')).to.equal(hex([asm.OP_CODES.OP_16]))
  })

  // --------------------------------------------------------------------------

  it('short push data', () => {
    expect(asm('20')).to.deep.equal(hex([1, 32]))
    expect(asm('ff')).to.deep.equal(hex([1, 255]))
    expect(asm('ffff')).to.deep.equal(hex([2, 255, 255]))
    expect(asm('ff00ff00')).to.deep.equal(hex([4, 255, 0, 255, 0]))
    let x = ''
    for (let i = 0; i < 75; i++) x = x + 'ff'
    expect(asm(x).slice(0, 4)).to.deep.equal(hex([75, 255]))
  })

  // --------------------------------------------------------------------------

  it('push data 1', () => {
    expect(asm('00e59200c2382263a0724a2336e079c7fff7ef5c'))
      .to.equal('1400e59200c2382263a0724a2336e079c7fff7ef5c')
    let x = ''
    for (let i = 0; i < 76; i++) x = x + 'ff'
    expect(asm(x).slice(0, 6)).to.deep.equal(hex([asm.OP_CODES.OP_PUSHDATA1, 76, 255]))
    let y = ''
    for (let i = 0; i < 255; i++) y = y + 'ff'
    expect(asm(y).slice(0, 6)).to.deep.equal(hex([asm.OP_CODES.OP_PUSHDATA1, 255, 255]))
  })

  // --------------------------------------------------------------------------

  it('push data 2', () => {
    let x = ''
    for (let i = 0; i < 256; i++) x = x + 'ff'
    expect(asm(x).slice(0, 8)).to.deep.equal(hex([asm.OP_CODES.OP_PUSHDATA2, 0, 1, 255]))
  })

  // --------------------------------------------------------------------------

  it('push data 4', () => {
    let x = ''
    for (let i = 0; i < 256 * 256; i++) x = x + 'ff'
    expect(asm(x).slice(0, 12)).to.deep.equal(hex([asm.OP_CODES.OP_PUSHDATA4, 0, 0, 1, 0, 255]))
  })

  // --------------------------------------------------------------------------

  it('throws if invalid', () => {
    expect(() => asm('OP_')).to.throw('Bad hex')
    expect(() => asm('OP_FAKE')).to.throw('Bad hex')
    expect(() => asm('...')).to.throw('Bad hex')
  })

  // --------------------------------------------------------------------------

  it('21e8', () => {
    asm('e34d02244f210de0bcfd936f0f29e4a19008b3e1106f2fa6265edb3f04459d17 21e8 OP_SIZE OP_4 OP_PICK OP_SHA256 OP_SWAP OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DROP OP_CHECKSIG')
  })

  // --------------------------------------------------------------------------

  it('same as bsv lib asm', () => {
    const compare = s => expect(asm(s)).to.equal(new bsv.Script.fromASM(s).toHex()) // eslint-disable-line
    // compare('0') // bsv lib does not generate minimal encodings for 0-16
    // compare('00')
    // compare('01')
    compare('20')
    compare('ff')
    compare('ffff')
    compare('ffff00ff')
    compare('00e59200c2382263a0724a2336e079c7fff7ef5c')
    let push2 = ''
    for (let i = 0; i < 256; i++) push2 = push2 + 'ff'
    compare(push2)
    let push4 = ''
    for (let i = 0; i < 256 * 256; i++) push4 = push4 + 'ff'
    compare('e34d02244f210de0bcfd936f0f29e4a19008b3e1106f2fa6265edb3f04459d17 21e8 OP_SIZE OP_4 OP_PICK OP_SHA256 OP_SWAP OP_SPLIT OP_DROP OP_EQUALVERIFY OP_DROP OP_CHECKSIG')
    // const long = `1976a914ed5cb06f92a406cc20fa176242d7a012f046995c88ac 00ca9a3b 80fa7e60 805101 OP_14 OP_10 00e1f505 80969800 a9a6694101ea0b52323e111dc43df69c5f7a50097b2c327d911979e7fd6c5ea81512cd160aeac4d09a9c718709886faaa8afb7db2503f5ba7a550d5300bca48d3249aa229fe3bc48b39226c8a0f5ff8f75f3c0a853c45fad3f336104f020a08eea0e828d02c7bc24f519c47687a51f3f09bea191ad59774d67dfb85215ea3a65d7a03c647bdd2bbb13d4da220cf33a13d3aea3cc45d277879865bc9936c7b04c350eac76f462e07f8d79cba0dca9ea10fb4a7e07d60e8095d8167eb4872c683bfa5df452b8cf59c3fcc23cce09fba63ad22b100cef6b8357653773b6e3f7c1f5216b03b789fe54c09d0e4a360fc2dfd051e8ae21ec39603129f199b72dafd9c7f545a6c417195424324a7fdd23d249389ca8389bdb30a8f9d11e611a928f47a649e7f2986cac7b14566cf816fa534e477eba74aa5d677364c9f745acc195fcce8becc621813c0e6ce8e37e89ae7f000f032bc4b432521d72f9f4e5d304cbda455779dc3708025652fdeacbd3ea97d1ff36c3906a2d8f10eeb3ed15bf910a108000 c3 OP_13 OP_PICK OP_IF 42 OP_1 OP_ROLL OP_DROP OP_15 OP_PICK 68 OP_SPLIT OP_DROP 44 OP_SPLIT OP_NIP OP_0 OP_PICK 20 OP_SPLIT OP_DROP 00000000 OP_CAT OP_1 OP_PICK OP_1 OP_PICK OP_CAT 11 OP_PICK OP_CAT OP_HASH256 12 OP_PICK 24 OP_SPLIT OP_DROP OP_4 OP_SPLIT OP_NIP OP_EQUAL OP_VERIFY OP_DROP OP_DROP OP_ELSE OP_12 OP_PICK OP_4 OP_NUM2BIN OP_11 OP_PICK OP_CAT OP_0 OP_PICK 20 OP_SPLIT OP_DROP OP_0 OP_SPLIT OP_NIP OP_SHA256 OP_1 OP_PICK 40 OP_SPLIT OP_DROP 20 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 60 OP_SPLIT OP_DROP 40 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 8000 OP_SPLIT OP_DROP 60 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK a000 OP_SPLIT OP_DROP 8000 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK c000 OP_SPLIT OP_DROP a000 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK e000 OP_SPLIT OP_DROP c000 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 0001 OP_SPLIT OP_DROP e000 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 2001 OP_SPLIT OP_DROP 0001 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 4001 OP_SPLIT OP_DROP 2001 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 6001 OP_SPLIT OP_DROP 4001 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_1 OP_PICK 8001 OP_SPLIT OP_DROP 6001 OP_SPLIT OP_NIP OP_SHA256 OP_CAT OP_0 OP_PICK 00 OP_CAT OP_BIN2NUM OP_15 OP_PICK OP_11 OP_PICK OP_SUB OP_10 OP_PICK OP_DIV OP_9 OP_PICK OP_1 OP_PICK OP_MIN OP_9 OP_PICK OP_0 OP_3 OP_PICK OP_13 OP_PICK OP_SUB OP_MAX OP_MIN OP_14 OP_PICK OP_2 OP_PICK OP_11 OP_PICK OP_MUL OP_SUB OP_1 OP_PICK OP_10 OP_PICK OP_MUL OP_SUB OP_0 OP_PICK OP_8 OP_NUM2BIN 11 OP_PICK OP_CAT OP_HASH256 14 OP_PICK OP_16 OP_PICK OP_GREATERTHANOREQUAL OP_VERIFY 13 OP_PICK 14 OP_PICK OP_MUL OP_10 OP_PICK OP_MOD OP_6 OP_PICK OP_11 OP_PICK OP_MOD OP_NUMEQUAL OP_VERIFY 17 OP_PICK 18 OP_PICK OP_SIZE OP_NIP OP_8 OP_SUB OP_SPLIT OP_DROP 18 OP_PICK OP_SIZE OP_NIP 28 OP_SUB OP_SPLIT OP_NIP OP_1 OP_PICK OP_EQUAL OP_VERIFY OP_DROP OP_DROP OP_DROP OP_DROP OP_DROP OP_DROP OP_DROP OP_DROP OP_ENDIF OP_NOP OP_15 OP_PICK cdb285cc49e5ff3eed6536e7b426e8a528b05bf9276bd05431a671743e651ceb00 02dca1e194dd541a47f4c85fea6a4d45bb50f16ed2fddc391bf80b525454f8b409 f941a26b1c1802eaa09109701e4e632e1ef730b0b68c9517e7c19be2ba4c7d37 2f282d163597a82d72c263b004695297aecb4d758dccd1dbf61e82a3360bde2c 2cde0b36a3821ef6dbd1cc8d754dcbae97526904b063c2722da89735162d282f OP_6 OP_PICK OP_6 OP_PICK OP_HASH256 OP_NOP OP_NOP OP_0 OP_PICK OP_0 OP_PICK OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT 00 OP_CAT OP_BIN2NUM OP_1 OP_ROLL OP_DROP OP_NOP OP_7 OP_PICK OP_6 OP_PICK OP_6 OP_PICK OP_6 OP_PICK OP_6 OP_PICK OP_3 OP_PICK OP_6 OP_PICK OP_4 OP_PICK OP_7 OP_PICK OP_MUL OP_ADD OP_MUL 414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00 OP_NOP OP_1 OP_PICK OP_1 OP_PICK OP_1 OP_PICK OP_1 OP_PICK OP_MOD OP_2 OP_ROLL OP_DROP OP_1 OP_ROLL OP_1 OP_PICK OP_0 OP_LESSTHAN OP_IF OP_1 OP_PICK OP_1 OP_PICK OP_ADD OP_2 OP_ROLL OP_DROP OP_1 OP_ROLL OP_ENDIF OP_1 OP_PICK OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_NOP OP_2 OP_ROLL OP_DROP OP_1 OP_ROLL OP_1 OP_PICK OP_1 OP_PICK OP_2 OP_DIV OP_GREATERTHAN OP_IF OP_0 OP_PICK OP_2 OP_PICK OP_SUB OP_2 OP_ROLL OP_DROP OP_1 OP_ROLL OP_ENDIF OP_3 OP_PICK OP_SIZE OP_NIP OP_2 OP_PICK OP_SIZE OP_NIP OP_4 OP_2 OP_PICK OP_ADD OP_1 OP_PICK OP_ADD 30 OP_1 OP_PICK OP_CAT OP_2 OP_CAT OP_3 OP_PICK OP_CAT OP_7 OP_PICK OP_CAT OP_2 OP_CAT OP_2 OP_PICK OP_CAT OP_5 OP_PICK OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_1 OP_SPLIT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_SWAP OP_CAT OP_CAT OP_6 OP_PICK OP_CAT OP_0 OP_PICK OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_NOP OP_0 OP_PICK OP_7 OP_PICK OP_CHECKSIG OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_1 OP_ROLL OP_DROP OP_NOP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP OP_NIP`
    // compare(long)
  })
})

// ------------------------------------------------------------------------------------------------
