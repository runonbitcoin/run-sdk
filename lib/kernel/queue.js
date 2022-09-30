/**
 * queue.js
 *
 * Task queue when async jobs must run in serial
 */

// ------------------------------------------------------------------------------------------------
// SerialTaskQueue
// ------------------------------------------------------------------------------------------------

class SerialTaskQueue {
  constructor () {
    this.tasks = []
  }

  async _enqueue (func) {
    return new Promise((resolve, reject) => {
      this.tasks.push({ func, reject, resolve })
      if (this.tasks.length === 1) this._execNext()
    })
  }

  async _execNext () {
    const next = this.tasks[0]
    try {
      const result = next.func()
      next.resolve(result instanceof Promise ? await result : result)
    } catch (e) {
      next.reject(e)
    } finally {
      this.tasks.shift()
      if (this.tasks.length) this._execNext()
    }
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = SerialTaskQueue
