/**
 * queue.js
 *
 * Tests for lib/kernel/queue.js
 */

const { describe, it } = require('mocha')
require('chai').use(require('chai-as-promised'))
const Run = require('../env/run')
const unmangle = require('../env/unmangle')
const { expect } = require('chai')
const { _SerialTaskQueue } = unmangle(Run)

// ------------------------------------------------------------------------------------------------
// SerialTaskQueue
// ------------------------------------------------------------------------------------------------

describe('SerialTaskQueue', () => {
  it('runs single task', async () => {
    const queue = unmangle(new _SerialTaskQueue())
    let done = false
    const ret = await queue._enqueue(async () => { done = true; return 1 })
    expect(done).to.equal(true)
    expect(ret).to.equal(1)
  })

  // --------------------------------------------------------------------------------------------

  it('serializes multiple tasks', async () => {
    const queue = unmangle(new _SerialTaskQueue())
    let first = false
    let second = false
    queue._enqueue(async () => {
      expect(first).to.equal(false)
      expect(second).to.equal(false)
      first = true
    })
    await queue._enqueue(async () => {
      expect(first).to.equal(true)
      expect(second).to.equal(false)
      second = true
    })
    expect(first).to.equal(true)
    expect(second).to.equal(true)
  })

  // --------------------------------------------------------------------------------------------

  it('rethrows error', async () => {
    const queue = unmangle(new _SerialTaskQueue())
    await expect(queue._enqueue(async () => { throw new Error() })).to.be.rejected
  })

  // --------------------------------------------------------------------------------------------

  it('supports non-promise tasks', async () => {
    const queue = unmangle(new _SerialTaskQueue())
    const ret = await queue._enqueue(() => 1)
    expect(ret).to.equal(1)
  })
})

// ------------------------------------------------------------------------------------------------
