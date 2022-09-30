/**
 * state-filter.js
 *
 * A specialized bloom filter used to filter states returned from the Run State API.
 *
 * The local state filter you build is a JSON object. You call functions to change it.
 * The bloom filter internally uses the murmur3 hash with a seed of 1.
 *
 * USAGE
 * -----
 *
 * Creating a new state filter
 *
 *      const filter = StateFilter.create()
 *
 * Adding and removing keys
 *
 *      StateFilter.add(filter, key)
 *      StateFilter.remove(filter, key)
 *
 * Converting to and from base64
 *
 *      const base64 = StateFilter.toBase64(filter)
 *      const filter = StateFilter.fromBase64(base64)
 *
 * CONFIGURATION
 * -------------
 *
 * The default settings are for filtering out a small number (< 100) of Code (contract) states,
 * because those are usually the ones that we already have before we make the API call. If that
 * is your case, then you do not need to pass parameters into the constructor. Apps with a larger
 * number of filtered states may should bump up the default settings to get good behavior. You
 * may use https://hur.st/bloomfilter to pick a good size and number of hashes.
 *
 * REMOVALS
 * --------
 *
 * The StateFilter supports removals of keys. This can be used to remove states that are expired
 * from your state cache from the filter so they are retrieved again next time. The StateFilter
 * does this by storing a count in each bucket instead of a simple boolean. Only keys which
 * were previously added may be removed.
 *
 * SERIALIZATION
 * -------------
 *
 * The StateFilter supports two serializations - one as JSON, which is its default form, which
 * stores all of the counts in the filter, which is used locally, and supports removals. The second
 * is as a Base64 string which may be used in an API call, which does not store the counts, and is
 * efficiently encoded.
 */

// ------------------------------------------------------------------------------------------------
// create
// ------------------------------------------------------------------------------------------------

function create (size = 960, numHashes = 7) {
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) throw new Error('invalid size: ' + size)
  if (size % 8 !== 0) throw new Error('size must be a multiple of 8: ' + size)
  if (typeof numHashes !== 'number' || !Number.isInteger(numHashes) || numHashes <= 0) throw new Error('invalid numHashes: ' + numHashes)

  return {
    buckets: new Array(size).fill(0),
    numHashes: numHashes
  }
}

// ------------------------------------------------------------------------------------------------
// add
// ------------------------------------------------------------------------------------------------

function add (filter, key) {
  if (typeof key !== 'string') throw new Error('invalid key: ' + key)

  if (this.possiblyHas(filter, key)) return

  for (let i = 1; i <= filter.numHashes; i++) {
    const n = hash(key, i) % filter.buckets.length
    filter.buckets[n]++
  }
}

// ------------------------------------------------------------------------------------------------
// remove
// ------------------------------------------------------------------------------------------------

function remove (filter, key) {
  if (typeof key !== 'string') throw new Error('invalid key: ' + key)

  const buckets = []
  for (let i = 1; i <= filter.numHashes; i++) {
    const n = hash(key, i) % filter.buckets.length
    if (!filter.buckets[n]) return false
    buckets.push(n)
  }

  buckets.forEach(n => filter.buckets[n]--)

  return true
}

// ------------------------------------------------------------------------------------------------
// possiblyHas
// ------------------------------------------------------------------------------------------------

function possiblyHas (filter, key) {
  for (let i = 1; i <= filter.numHashes; i++) {
    const n = hash(key, i) % filter.buckets.length
    if (!filter.buckets[n]) return false
  }
  return true
}

// ------------------------------------------------------------------------------------------------
// toBase64
// ------------------------------------------------------------------------------------------------

function toBase64 (filter) {
  const b = filter.buckets

  const data = new Array(1 + b.length / 8)

  data[0] = filter.numHashes

  for (let i = 0, j = 1; i < b.length; i += 8, j++) {
    data[j] =
        ((b[i + 0] > 0) << 7) |
        ((b[i + 1] > 0) << 6) |
        ((b[i + 2] > 0) << 5) |
        ((b[i + 3] > 0) << 4) |
        ((b[i + 4] > 0) << 3) |
        ((b[i + 5] > 0) << 2) |
        ((b[i + 6] > 0) << 1) |
        ((b[i + 7] > 0) << 0)
  }

  return Buffer.from(data).toString('base64')
}

// ------------------------------------------------------------------------------------------------
// fromBase64
// ------------------------------------------------------------------------------------------------

function fromBase64 (base64) {
  const data = Buffer.from(base64, 'base64')

  const numHashes = data[0]
  const buckets = new Array((data.length - 1) * 8)

  for (let i = 1, j = 0; i < data.length; i++, j += 8) {
    buckets[j + 0] = (data[i] >> 7) & 1
    buckets[j + 1] = (data[i] >> 6) & 1
    buckets[j + 2] = (data[i] >> 5) & 1
    buckets[j + 3] = (data[i] >> 4) & 1
    buckets[j + 4] = (data[i] >> 3) & 1
    buckets[j + 5] = (data[i] >> 2) & 1
    buckets[j + 6] = (data[i] >> 1) & 1
    buckets[j + 7] = (data[i] >> 0) & 1
  }

  return { numHashes, buckets }
}

// ------------------------------------------------------------------------------------------------
// murmurhash3_32_gc
// ------------------------------------------------------------------------------------------------

/**
 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
 *
 * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
 * @see http://github.com/garycourt/murmurhash-js
 * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
 * @see http://sites.google.com/site/murmurhash/
 *
 * @param {string} key ASCII only
 * @param {number} seed Positive integer only
 * @return {number} 32-bit positive integer hash
 */
function hash (key, seed) {
  const remainder = key.length & 3 // key.length % 4
  const bytes = key.length - remainder
  let h1 = seed
  const c1 = 0xcc9e2d51
  const c2 = 0x1b873593
  let i = 0
  let h1b = 0
  let k1 = 0

  while (i < bytes) {
    k1 =
        ((key.charCodeAt(i) & 0xff)) |
        ((key.charCodeAt(++i) & 0xff) << 8) |
        ((key.charCodeAt(++i) & 0xff) << 16) |
        ((key.charCodeAt(++i) & 0xff) << 24)
    ++i

    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff
    k1 = (k1 << 15) | (k1 >>> 17)
    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff

    h1 ^= k1
    h1 = (h1 << 13) | (h1 >>> 19)
    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16))
  }

  k1 = 0

  switch (remainder) {
    case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16 // eslint-disable-line
    case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8 // eslint-disable-line
    case 1: k1 ^= (key.charCodeAt(i) & 0xff) // eslint-disable-line

      k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff
      h1 ^= k1
  }

  h1 ^= key.length

  h1 ^= h1 >>> 16
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff
  h1 ^= h1 >>> 13
  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff
  h1 ^= h1 >>> 16

  return h1 >>> 0
}

// ------------------------------------------------------------------------------------------------

module.exports = { create, add, remove, possiblyHas, toBase64, fromBase64 }
