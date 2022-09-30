/**
 * local-owner.js
 *
 * Default implementation of the Owner API
 */

const bsv = require('bsv')
const { PrivateKey, Script, Transaction } = bsv
const { _bsvNetwork, _text } = require('../kernel/misc')
const { _signature, _sighash } = require('../kernel/bsv')
const OwnerWrapper = require('./owner-wrapper')

// ------------------------------------------------------------------------------------------------
// LocalOwner
// ------------------------------------------------------------------------------------------------

/**
 * An owner that is derived from a local private key
 */
class LocalOwner extends OwnerWrapper {
  // --------------------------------------------------------------------------
  // constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new LocalOwner
   * @param {?string|PrivateKey} privkey A private key string or object, or undefined to generate
   * @param {?string} network Optional blockchain network to use if generating a privkey
   */
  constructor (privkey, network = undefined) {
    super()

    // Get network if don't have one
    network = network || (require('../run').instance && require('../run').instance.blockchain.network)
    const bsvNetwork = network && _bsvNetwork(network)

    // Check that the private key passed in is one of our suported types
    if (typeof privkey !== 'undefined' && typeof privkey !== 'string' && !(privkey instanceof PrivateKey)) {
      throw new Error(`Invalid private key: ${_text(privkey)}`)
    }

    // Check the network matches if we've received a private key
    if (bsvNetwork && privkey && privkey instanceof PrivateKey && privkey.network.name !== bsvNetwork) {
      throw new Error('Private key network mismatch')
    }

    // Generate a random key if none is specified
    try {
      this.bsvPrivateKey = new PrivateKey(privkey, bsvNetwork)
    } catch (e) {
      throw new Error(`Invalid private key: ${_text(privkey)}\n\n${e}`)
    }

    // If the private key does not match what's passed in, then it's not a private key
    if (privkey && this.bsvPrivateKey.toString() !== privkey.toString()) {
      throw new Error(`Invalid private key: ${_text(privkey)}`)
    }

    // Setup a bunch of other useful properties
    this.bsvPublicKey = this.bsvPrivateKey.publicKey
    this.bsvAddress = this.bsvPublicKey.toAddress()
    this.privkey = this.bsvPrivateKey.toString()
    this.pubkey = this.bsvPublicKey.toString()
    this.address = this.bsvAddress.toString()
  }

  // --------------------------------------------------------------------------
  // sign
  // --------------------------------------------------------------------------

  async sign (rawtx, parents, locks) {
    const CommonLock = require('../kernel/common-lock')
    const MainnetGroup = require('../extra').main.Group
    const TestnetGroup = require('../extra').test.Group

    const tx = new Transaction(rawtx)

    // Populate previous outputs
    parents.forEach((parent, n) => {
      if (!parent) return

      tx.inputs[n].output = new Transaction.Output({
        satoshis: parent.satoshis,
        script: new Script(parent.script)
      })
    })

    for (let i = 0; i < tx.inputs.length; i++) {
      // Sign P2PKH inputs

      const isCommonLock = locks[i] instanceof CommonLock

      const isPayToPublicKeyHashOut = tx.inputs[i].output &&
        tx.inputs[i].output.script.isPublicKeyHashOut() &&
        tx.inputs[i].output.script.toAddress().toString() === this.address

      if (isCommonLock || isPayToPublicKeyHashOut) {
        const parentScript = new Script(parents[i].script)
        if (parentScript.toAddress().toString() !== this.address) continue

        const sig = await _signature(tx, i, parentScript, parents[i].satoshis, this.bsvPrivateKey)
        const script = Script.fromASM(`${sig} ${this.pubkey}`)
        tx.inputs[i].setScript(script)
      }

      // Sign multi-sig inputs

      const isGroup = (locks[i] instanceof MainnetGroup || locks[i] instanceof TestnetGroup) &&
        locks[i].pubkeys.includes(this.pubkey) &&
        tx.inputs[i].script.chunks.length <= locks[i].required

      if (isGroup) {
        // Get the pubkeys for all existing signatures
        const sigs = tx.inputs[i].script.chunks.slice(1).map(chunk => chunk.buf.toString('hex'))
        const prevout = { script: new bsv.Script(parents[i].script), satoshis: parents[i].satoshis }
        const signedPubkeys = await getSignedPubkeys(tx, i, prevout, sigs, locks[i].pubkeys)

        // If we already signed it, dont sign again
        if (signedPubkeys.includes(this.pubkey)) continue

        // Create a signature
        const parentScript = new Script(parents[i].script)
        const sig = await _signature(tx, i, parentScript, parents[i].satoshis, this.bsvPrivateKey)

        // Add the signature in pubkey order
        const newsigs = locks[i].pubkeys.map(pubkey => {
          const signedPubkeyIndex = signedPubkeys.indexOf(pubkey)
          if (signedPubkeyIndex !== -1) return sigs[signedPubkeyIndex]
          if (pubkey === this.pubkey) return sig
          return null
        }).filter(sig => sig !== null)

        const script = Script.fromASM(`OP_0 ${newsigs.join(' ')}`)
        tx.inputs[i].setScript(script)
      }
    }

    return tx.toString('hex')
  }

  // --------------------------------------------------------------------------
  // nextOwner
  // --------------------------------------------------------------------------

  async nextOwner () { return this.address }
}

// ------------------------------------------------------------------------------------------------
// getSignedPubkeys
// ------------------------------------------------------------------------------------------------

async function getSignedPubkeys (tx, vin, prevout, sigs, pubkeys) {
  const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID
  const satoshisBN = new bsv.crypto.BN(prevout.satoshis)
  const hashbuf = await _sighash(tx, sighashType, vin, prevout.script, satoshisBN)
  const bsvpubkeys = pubkeys.map(pubkey => new bsv.PublicKey(pubkey))

  // Get the index of each sig
  const nsigs = sigs.map(sig => {
    const sighex = sig.slice(0, sig.length - 2)
    const sigbuf = bsv.deps.Buffer.from(sighex, 'hex')
    const bsvsig = bsv.crypto.Signature.fromDER(sigbuf)
    return bsvpubkeys.findIndex(pubkey => bsv.crypto.ECDSA.verify(hashbuf, bsvsig, pubkey, 'little'))
  })

  const badSigIndex = nsigs.findIndex(n => n === -1)
  if (badSigIndex !== -1) throw new Error(`Bad signature at index ${badSigIndex}`)

  return nsigs.map(n => pubkeys[n])
}

// ------------------------------------------------------------------------------------------------

LocalOwner._getSignedPubkeys = getSignedPubkeys

module.exports = LocalOwner
