const recreateJigsFromStates = require('../kernel/recreate-sync')

const mainnetStates = require('./states-mainnet.json')
const testnetStates = require('./states-testnet.json')

const mainnetJigs = recreateJigsFromStates(mainnetStates)
const testnetJigs = recreateJigsFromStates(testnetStates)

const main = {
  asm: mainnetJigs['284ce17fd34c0f41835435b03eed149c4e0479361f40132312b4001093bb158f_o1'],
  B: mainnetJigs['05f67252e696160a7c0099ae8d1ec23c39592378773b3a5a55f16bd1286e7dcb_o3'],
  Base58: mainnetJigs['81bcef29b0e4ed745f3422c0b764a33c76d0368af2d2e7dd139db8e00ee3d8a6_o1'],
  expect: mainnetJigs['71fba386341b932380ec5bfedc3a40bce43d4974decdc94c419a94a8ce5dfc23_o1'],
  Group: mainnetJigs['780ab8919cb89323707338070323c24ce42cdec2f57d749bd7aceef6635e7a4d_o1'],
  Hex: mainnetJigs['727e7b423b7ee40c0b5be87fba7fa5673ea2d20a74259040a7295d9c32a90011_o1'],
  NFT: mainnetJigs.b2f52f369d6ac4210585e0d173020106bd338197f136e02bc4d1fb2af3ef789f_o1,
  sha256: mainnetJigs['3b7ef411185bbe3d01caeadbe6f115b0103a546c4ef0ac7474aa6fbb71aff208_o1'],
  Token: mainnetJigs['72a61eb990ffdb6b38e5f955e194fed5ff6b014f75ac6823539ce5613aea0be8_o1'],
  Token10: mainnetJigs.b17a9af70ab0f46809f908b2e900e395ba40996000bf4f00e3b27a1e93280cf1_o1,
  Token20: mainnetJigs['72a61eb990ffdb6b38e5f955e194fed5ff6b014f75ac6823539ce5613aea0be8_o1'],
  Tx: mainnetJigs['05f67252e696160a7c0099ae8d1ec23c39592378773b3a5a55f16bd1286e7dcb_o1'],
  txo: mainnetJigs['05f67252e696160a7c0099ae8d1ec23c39592378773b3a5a55f16bd1286e7dcb_o2']
}

const test = {
  asm: testnetJigs['03e21aa8fcf08fa6985029ad2e697a2309962527700246d47d891add3cfce3ac_o1'],
  B: testnetJigs.d476fd7309a0eeb8b92d715e35c6e273ad63c0025ff6cca927bd0f0b64ed88ff_o3,
  Base58: testnetJigs['424abf066be56b9dd5203ed81cf1f536375351d29726d664507fdc30eb589988_o1'],
  expect: testnetJigs.f97d4ac2a3d6f5ed09fad4a4f341619dc5a3773d9844ff95c99c5d4f8388de2f_o1,
  Group: testnetJigs['63e0e1268d8ab021d1c578afb8eaa0828ccbba431ffffd9309d04b78ebeb6e56_o1'],
  Hex: testnetJigs['1f0abf8d94477b1cb57629d861376616f6e1d7b78aba23a19da3e6169caf489e_o2'],
  NFT: testnetJigs['8554b58e95bbd7a1899b54ca1318cc3ce140c6cd7ed64789dcaf5ea5dcfdb1f1_o1'],
  sha256: testnetJigs['4a1929527605577a6b30710e6001b9379400421d8089d34bb0404dd558529417_o1'],
  Token: testnetJigs['7d14c868fe39439edffe6982b669e7b4d3eb2729eee7c262ec2494ee3e310e99_o1'],
  Token10: testnetJigs['0bdf33a334a60909f4c8dab345500cbb313fbfd50b1d98120227eae092b81c39_o1'],
  Token20: testnetJigs['7d14c868fe39439edffe6982b669e7b4d3eb2729eee7c262ec2494ee3e310e99_o1'],
  Tx: testnetJigs.d476fd7309a0eeb8b92d715e35c6e273ad63c0025ff6cca927bd0f0b64ed88ff_o1,
  txo: testnetJigs.d476fd7309a0eeb8b92d715e35c6e273ad63c0025ff6cca927bd0f0b64ed88ff_o2
}

main.states = mainnetStates
test.states = testnetStates

module.exports.main = {}
module.exports.test = {}

Object.assign(module.exports.main, main)
Object.assign(module.exports.test, test)

Object.assign(module.exports, main)
