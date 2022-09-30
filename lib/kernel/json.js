/**
 * json.js
 *
 * Converts complex javascript objects with jigs into JSON
 *
 * This conversion is basically what determines what kinds of data may be stored in jigs, stored
 * as class properties, or passed into functions. If we were to support a new kind of data type,
 * we would start by supporting it here.
 *
 * We use a custom JSON notation encoding because we haven't found any other suitable format
 * to-date. This encoding is JSON and may be used as such. However, it is also special JSON.
 * The JSON represents a complex JS object, and through decoding, we can convert it back into
 * a rich object.
 *
 * We use what we call "$ objects" to do this. $ objects are JSON objects with a single property
 * that begins with '$'. This means it contains a special value that JSON is unable to
 * represent. Through this approach, in addition to standard JSON, we support the following:
 *
 *      Type                    $ Prefix        Example
 *      ---------               --------        -----------
 *      Undefined               $und            { $und: 1 }
 *      NaN                     $nan            { $nan: 1 }
 *      Infinity                $inf            { $inf: 1 }
 *      Negative infinity       $ninf           { $ninf: 1 }
 *      Negative zero           $n0             { $n0: 1 }
 *      Set instance            $set            { $set: [1], props: { n: 1 } }
 *      Map instance            $map            { $map: [[1, 2]], props: { n: 1 } }
 *      Uint8Array instance     $ui8a           { $ui8a: '<base64data>' }
 *      Jig/Code/Berry          $jig            { $jig: 1 }
 *      Arbitrary object        $arb            { $arb: { n: 1 }, T: { $jig: 1 } }
 *      Object                  $obj            { $obj: { $n: 1 } }
 *      Sparse array            $arr            { $arr: { 0: 'a', 100: 'c' } }
 *      Duplicate object        $dup            { $dup: ['n', 'm', '0'] }
 *
 * Order of properties is important and must be preserved during encode and decode. Duplicate paths
 * are arrays into the encoded object, not the original object.
 */

const {
  _text, _basicObject, _basicArray, _basicSet, _basicMap, _basicUint8Array,
  _defined, _negativeZero
} = require('./misc')
const { _deterministicObjectKeys } = require('./determinism')
const Sandbox = require('./sandbox')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const SIS = Sandbox._intrinsicSet
const HIS = Sandbox._hostIntrinsicSet

// Run could be made to work with these words allowed, but it opens the door to user bugs
const RESERVED_PROPS = new Set(['constructor', 'prototype'])

const BASE64_CHARS = new Set()
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  .split('').forEach(x => BASE64_CHARS.add(x))

const _throwEnc = (x, reason) => { throw new Error(`Cannot encode ${_text(x)}\n\n${reason}`) }
const _throwDec = (x, reason) => { throw new Error(`Cannot decode ${_text(JSON.stringify(x))}\n\n${reason}`) }

// ------------------------------------------------------------------------------------------------
// encode
// ------------------------------------------------------------------------------------------------

/**
 * Encodes x into $json
 * @param {object} x Object to encode
 * @param {?function} options._encodeJig Gets an encoded id for a jig
 * @param {?object} options._intrinsics Intrinsics to use for the encoded json
 * @returns Encoded json
 */
function encode (x, options = {}) {
  const paths = options._paths || new Map()
  const intrinsics = options._intrinsics || Sandbox._hostIntrinsics
  return _encodeAny(x, [], paths, intrinsics, options._encodeJig)
}

// ------------------------------------------------------------------------------------------------
// _encodeAny
// ------------------------------------------------------------------------------------------------

function _encodeAny (x, path, paths, intrinsics, encodeJig) {
  switch (typeof x) {
    case 'undefined': return _encodeUndefined(intrinsics)
    case 'string': return x
    case 'boolean': return x
    case 'number': return _encodeNumber(x, intrinsics)
    case 'symbol': break
    case 'object': return _encodeObject(x, path, paths, intrinsics, encodeJig)
    case 'function': return _encodeObject(x, path, paths, intrinsics, encodeJig)
  }
  _throwEnc(x, `Unsupported type ${_text(typeof x)}`)
}

// ------------------------------------------------------------------------------------------------
// _encodeUndefined
// ------------------------------------------------------------------------------------------------

function _encodeUndefined (intrinsics) {
  const y = new intrinsics.Object()
  y.$und = 1
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeNumber
// ------------------------------------------------------------------------------------------------

function _encodeNumber (x, intrinsics) {
  if (isNaN(x) || !isFinite(x) || _negativeZero(x)) {
    const y = new intrinsics.Object()
    if (isNaN(x)) y.$nan = 1
    if (x === Infinity) y.$inf = 1
    if (x === -Infinity) y.$ninf = 1
    if (_negativeZero(x)) y.$n0 = 1
    return y
  }
  return x
}

// ------------------------------------------------------------------------------------------------
// _encodeObject
// ------------------------------------------------------------------------------------------------

function _encodeObject (x, path, paths, intrinsics, encodeJig) {
  if (!x) return null

  // Check for dups
  if (paths.has(x)) {
    const y = new intrinsics.Object()
    y.$dup = intrinsics.Array.from(paths.get(x))
    return y
  }

  // Remember potential dups
  paths.set(x, path)

  // Check that this not an intrinsic type
  if (SIS.has(x) || HIS.has(x)) _throwEnc(x, 'Unsupported intrinsic')

  if (_basicObject(x)) return _encodeBasicObject(x, path, paths, intrinsics, encodeJig)
  if (_basicArray(x)) return _encodeBasicArray(x, path, paths, intrinsics, encodeJig)
  if (_basicSet(x)) return _encodeBasicSet(x, path, paths, intrinsics, encodeJig)
  if (_basicMap(x)) return _encodeBasicMap(x, path, paths, intrinsics, encodeJig)
  if (_basicUint8Array(x)) return _encodeBasicUint8Array(x, path, paths, intrinsics, encodeJig)

  // Handle jigs and arbitrary objects
  if (encodeJig) {
    const Creation = require('./creation')
    if (x instanceof Creation) return _encodeJig(x, path, paths, intrinsics, encodeJig)
    if (Object.getPrototypeOf(x).constructor instanceof Creation) return _encodeArbitraryObject(x, path, paths, intrinsics, encodeJig)
  }

  _throwEnc(x, 'Unsupported object')
}

// ------------------------------------------------------------------------------------------------
// _encodeBasicObject
// ------------------------------------------------------------------------------------------------

function _encodeBasicObject (x, path, paths, intrinsics, encodeJig) {
  const $ = _deterministicObjectKeys(x).some(key => key.startsWith('$'))
  const y = new intrinsics.Object()
  let yobj = y
  let ypath = path
  if ($) {
    y.$obj = new intrinsics.Object()
    yobj = y.$obj
    ypath = path.concat(['$obj'])
  }
  _deterministicObjectKeys(x).forEach(key => {
    if (RESERVED_PROPS.has(key)) _throwEnc(x, `Reserved key: ${_text(key)}`)
    const subpath = ypath.concat([key.toString()])
    yobj[key] = _encodeAny(x[key], subpath, paths, intrinsics, encodeJig)
  })
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeBasicArray
// ------------------------------------------------------------------------------------------------

function _encodeBasicArray (x, path, paths, intrinsics, encodeJig) {
  const keys = _deterministicObjectKeys(x)
  if (keys.length === x.length) {
    const y = new intrinsics.Array()
    keys.forEach(key => {
      const subpath = path.concat([key.toString()])
      const subvalue = _encodeAny(x[key], subpath, paths, intrinsics, encodeJig)
      y.push(subvalue)
    })
    return y
  } else {
    // Sparse array
    const y = new intrinsics.Object()
    const yarr = new intrinsics.Object()
    const ypath = path.concat(['$arr'])
    keys.forEach(key => {
      if (RESERVED_PROPS.has(key)) _throwEnc(x, `Reserved key: ${_text(key)}`)
      const subpath = ypath.concat([key.toString()])
      yarr[key] = _encodeAny(x[key], subpath, paths, intrinsics, encodeJig)
    })
    y.$arr = yarr
    return y
  }
}

// ------------------------------------------------------------------------------------------------
// _encodeBasicSet
// ------------------------------------------------------------------------------------------------

function _encodeBasicSet (x, path, paths, intrinsics, encodeJig) {
  const y = new intrinsics.Object()
  y.$set = new intrinsics.Array()
  let i = 0
  const ypath = path.concat(['$set'])
  for (const v of x) {
    const subpath = ypath.concat([i.toString()])
    const subvalue = _encodeAny(v, subpath, paths, intrinsics, encodeJig)
    y.$set.push(subvalue)
    i++
  }
  if (_deterministicObjectKeys(x).length) {
    y.props = new intrinsics.Object()
    const ypropspath = path.concat(['props'])
    _deterministicObjectKeys(x).forEach(key => {
      if (RESERVED_PROPS.has(key)) _throwEnc(x, `Reserved key: ${_text(key)}`)
      const subpath = ypropspath.concat([key.toString()])
      y.props[key] = _encodeAny(x[key], subpath, paths, intrinsics, encodeJig)
    })
  }
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeBasicMap
// ------------------------------------------------------------------------------------------------

function _encodeBasicMap (x, path, paths, intrinsics, encodeJig) {
  const y = new intrinsics.Object()
  y.$map = new intrinsics.Array()
  let i = 0
  const ypath = path.concat(['$map'])
  for (const [k, v] of x) {
    const entry = new intrinsics.Array()
    entry.push(_encodeAny(k, ypath.concat([i.toString(), '0']), paths, intrinsics, encodeJig))
    entry.push(_encodeAny(v, ypath.concat([i.toString(), '1']), paths, intrinsics, encodeJig))
    y.$map.push(entry)
    i++
  }
  if (_deterministicObjectKeys(x).length) {
    y.props = new intrinsics.Object()
    const ypropspath = path.concat(['props'])
    _deterministicObjectKeys(x).forEach(key => {
      if (RESERVED_PROPS.has(key)) _throwEnc(x, `Reserved key: ${_text(key)}`)
      const subpath = ypropspath.concat([key.toString()])
      y.props[key] = _encodeAny(x[key], subpath, paths, intrinsics, encodeJig)
    })
  }
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeBasicUint8Array
// ------------------------------------------------------------------------------------------------

function _encodeBasicUint8Array (x, path, paths, intrinsics, encodeJig) {
  const keys = _deterministicObjectKeys(x)
  if (keys.length !== x.length) _throwEnc(x, 'Uint8Arrays must not contain props')
  const y = new intrinsics.Object()
  // Convert to Uint8Array to fix a bug in browsers if x is a sandbox intrinsic
  const b = Buffer.from(new Uint8Array(x))
  y.$ui8a = b.toString('base64')
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeJig
// ------------------------------------------------------------------------------------------------

function _encodeJig (x, path, paths, intrinsics, encodeJig) {
  const y = new intrinsics.Object()
  y.$jig = encodeJig(x)
  return y
}

// ------------------------------------------------------------------------------------------------
// _encodeArbitraryObject
// ------------------------------------------------------------------------------------------------

function _encodeArbitraryObject (x, path, paths, intrinsics, encodeJig) {
  const y = new intrinsics.Object()
  const xprops = Object.assign({}, x)
  const yarbpath = path.concat(['$arb'])
  const yTpath = path.concat(['T'])
  Object.keys(xprops).forEach(key => {
    if (RESERVED_PROPS.has(key)) _throwEnc(x, `Reserved key: ${_text(key)}`)
  })
  y.$arb = _encodeAny(xprops, yarbpath, paths, intrinsics, encodeJig)
  y.T = _encodeAny(Object.getPrototypeOf(x).constructor, yTpath, paths, intrinsics, encodeJig)
  return y
}

// ------------------------------------------------------------------------------------------------
// decode
// ------------------------------------------------------------------------------------------------

/**
 * Decodes from JSON to a rich object
 * @param {object} y JSON to decode
 * @param {object} options._intrinsics The set of intrinsics to use when decoding
 * @param {function} options._decodeJig Gets a jig from its encoded id
 */
function decode (y, options = {}) {
  const root = y
  const decs = new Map() // enc -> dec
  const intrinsics = options._intrinsics || Sandbox._hostIntrinsics
  return _decodeAny(y, root, decs, intrinsics, options._decodeJig)
}

// ------------------------------------------------------------------------------------------------
// _decodeAny
// ------------------------------------------------------------------------------------------------

function _decodeAny (y, root, decs, intrinsics, decodeJig) {
  switch (typeof y) {
    case 'string': return y
    case 'boolean': return y
    case 'number':return _decodeNumber(y)
    case 'object': return _decodeObject(y, root, decs, intrinsics, decodeJig)
    case 'function': return _decodeObject(y, root, decs, intrinsics, decodeJig)
  }
  _throwDec(y, `Unsupported type ${_text(typeof y)}`)
}

// ------------------------------------------------------------------------------------------------
// _decodeNumber
// ------------------------------------------------------------------------------------------------

function _decodeNumber (y) {
  if (isNaN(y) || !isFinite(y)) _throwDec(y, `Unsupported number ${_text(y)}`)
  // Firefox special case. Decodeing -0 to 0 should be safe because -0 should not be encoded.
  if (_negativeZero(y)) return 0
  return y
}

// ------------------------------------------------------------------------------------------------
// _decodeObject
// ------------------------------------------------------------------------------------------------

function _decodeObject (y, root, decs, intrinsics, decodeJig) {
  if (!y) return null

  if (_basicObject(y)) {
    // Check if there are any special props
    let $
    Object.keys(y).forEach(key => {
      if (key.startsWith('$')) {
        if ($) _throwDec(y, 'Multiple $ keys')
        $ = key
      }
    })

    // Primitives
    if ($ === '$und' && y.$und === 1) return undefined
    if ($ === '$n0' && y.$n0 === 1) return -0
    if ($ === '$nan' && y.$nan === 1) return NaN
    if ($ === '$inf' && y.$inf === 1) return Infinity
    if ($ === '$ninf' && y.$ninf === 1) return -Infinity

    // Objects
    if (!$) return _decodeBasicObject(y, root, decs, intrinsics, decodeJig)
    if ($ === '$obj') return _decodeNonstandardObject(y, root, decs, intrinsics, decodeJig)
    if ($ === '$arr') return _decodeSparseArray(y, root, decs, intrinsics, decodeJig)
    if ($ === '$dup') return _decodeDup(y, root, decs, intrinsics, decodeJig)
    if ($ === '$set') return _decodeBasicSet(y, root, decs, intrinsics, decodeJig)
    if ($ === '$map') return _decodeBasicMap(y, root, decs, intrinsics, decodeJig)
    if ($ === '$ui8a') return _decodeBasicUint8Array(y, root, decs, intrinsics, decodeJig)
  }

  if (_basicArray(y)) return _decodeBasicArray(y, root, decs, intrinsics, decodeJig)

  // Revive jigs and arbitrary objects
  if (decodeJig) {
    if (_basicObject(y) && _defined(y.$jig)) return _decodeJig(y, root, decs, intrinsics, decodeJig)
    if (_basicObject(y) && _defined(y.$arb) && _defined(y.T)) return _decodeArbitraryObject(y, root, decs, intrinsics, decodeJig)
  }

  _throwDec(y, `Unsupported object ${_text(y)}`)
}

// ------------------------------------------------------------------------------------------------
// _decodeBasicObject
// ------------------------------------------------------------------------------------------------

function _decodeBasicObject (y, root, decs, intrinsics, decodeJig) {
  const x = new intrinsics.Object()
  decs.set(y, x)
  _deterministicObjectKeys(y).forEach(key => {
    if (RESERVED_PROPS.has(key)) _throwDec(x, `Reserved key: ${_text(key)}`)
    x[key] = _decodeAny(y[key], root, decs, intrinsics, decodeJig)
  })
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeNonstandardObject
// ------------------------------------------------------------------------------------------------

function _decodeNonstandardObject (y, root, decs, intrinsics, decodeJig) {
  const yobj = y.$obj
  if (!(_basicObject(yobj) && yobj)) _throwDec(y, 'Invalid $obj')
  const x = new intrinsics.Object()
  decs.set(y, x)
  _deterministicObjectKeys(yobj).forEach(key => {
    if (RESERVED_PROPS.has(key)) _throwDec(x, `Reserved key: ${_text(key)}`)
    x[key] = _decodeAny(yobj[key], root, decs, intrinsics, decodeJig)
  })
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeSparseArray
// ------------------------------------------------------------------------------------------------

function _decodeSparseArray (y, root, decs, intrinsics, decodeJig) {
  if (!(_basicObject(y.$arr) && y.$arr)) _throwDec(y, 'Invalid $arr')
  const x = new intrinsics.Array()
  decs.set(y, x)
  const yarr = y.$arr
  _deterministicObjectKeys(yarr).forEach(key => {
    if (RESERVED_PROPS.has(key)) _throwDec(x, `Reserved key: ${_text(key)}`)
    x[key] = _decodeAny(yarr[key], root, decs, intrinsics, decodeJig)
  })
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeDup
// ------------------------------------------------------------------------------------------------

function _decodeDup (y, root, decs, intrinsics, decodeJig) {
  const ydup = y.$dup
  if (!(_basicArray(ydup))) _throwDec(y, 'Invalid $dup')
  let enc = root
  for (let i = 0; i < ydup.length; i++) {
    const key = ydup[i]
    if (!(key in enc)) _throwDec(y, 'Invalid dup path')
    enc = enc[key]
  }
  if (!decs.has(enc)) _throwDec(y, 'Invalid dup path')
  const x = decs.get(enc)
  decs.set(y, x)
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeBasicSet
// ------------------------------------------------------------------------------------------------

function _decodeBasicSet (y, root, decs, intrinsics, decodeJig) {
  if (!_basicArray(y.$set)) _throwDec(y, 'Invalid $set')
  if (!(!_defined(y.props) || _basicObject(y.props))) _throwDec(y, 'Invalid $set props')
  const x = new intrinsics.Set()
  decs.set(y, x)
  for (const val of y.$set) {
    x.add(_decodeAny(val, root, decs, intrinsics, decodeJig))
  }
  const props = y.props
  if (props) {
    _deterministicObjectKeys(props).forEach(key => {
      if (RESERVED_PROPS.has(key)) _throwDec(x, `Reserved key: ${_text(key)}`)
      x[key] = _decodeAny(props[key], root, decs, intrinsics, decodeJig)
    })
  }
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeBasicMap
// ------------------------------------------------------------------------------------------------

function _decodeBasicMap (y, root, decs, intrinsics, decodeJig) {
  if (!_basicArray(y.$map)) _throwDec(y, 'Invalid $map')
  if (!(!_defined(y.props) || _basicObject(y.props))) _throwDec(y, 'Invalid $map props')
  const x = new intrinsics.Map()
  decs.set(y, x)
  for (const val of y.$map) {
    if (!_basicArray(val) || val.length !== 2) _throwDec(y)
    const subkey = _decodeAny(val[0], root, decs, intrinsics, decodeJig)
    const subval = _decodeAny(val[1], root, decs, intrinsics, decodeJig)
    x.set(subkey, subval)
  }
  const props = y.props
  if (props) {
    _deterministicObjectKeys(props).forEach(key => {
      if (RESERVED_PROPS.has(key)) _throwDec(x, `Reserved key: ${_text(key)}`)
      x[key] = _decodeAny(props[key], root, decs, intrinsics, decodeJig)
    })
  }
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeBasicUint8Array
// ------------------------------------------------------------------------------------------------

function _decodeBasicUint8Array (y, root, decs, intrinsics, decodeJig) {
  if (typeof y.$ui8a !== 'string') _throwDec(y, 'Invalid $ui8a')
  if (y.$ui8a.split('').some(c => !BASE64_CHARS.has(c))) _throwDec(y, 'Invalid $ui8a base64')
  const buf = Buffer.from(y.$ui8a, 'base64')
  // Safari/WebKit throws if we use TypedArray.from(). So we use new Uint8Array instead.
  const x = new intrinsics.Uint8Array(buf)
  decs.set(x, x)
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeBasicArray
// ------------------------------------------------------------------------------------------------

function _decodeBasicArray (y, root, decs, intrinsics, decodeJig) {
  const x = new intrinsics.Array()
  decs.set(y, x)
  for (const v of y) {
    x.push(_decodeAny(v, root, decs, intrinsics, decodeJig))
  }
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeJig
// ------------------------------------------------------------------------------------------------

function _decodeJig (y, root, decs, intrinsics, decodeJig) {
  const x = decodeJig(y.$jig)
  if (!x) _throwDec(y, 'Not a jig')
  decs.set(y, x)
  return x
}

// ------------------------------------------------------------------------------------------------
// _decodeArbitraryObject
// ------------------------------------------------------------------------------------------------

function _decodeArbitraryObject (y, root, decs, intrinsics, decodeJig) {
  const x = new intrinsics.Object()
  decs.set(y, x)
  const props = _decodeAny(y.$arb, root, decs, intrinsics, decodeJig)
  if (!_basicObject(props)) _throwDec(y, 'Invalid $arb')
  Object.assign(x, props)
  const T = _decodeAny(y.T, root, decs, intrinsics, decodeJig)
  if (!T) _throwDec(y, 'Not code')
  Object.setPrototypeOf(x, T.prototype)
  return x
}

// ------------------------------------------------------------------------------------------------

module.exports = {
  _encode: encode,
  _decode: decode
}
