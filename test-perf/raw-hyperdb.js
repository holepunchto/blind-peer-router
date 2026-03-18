const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const { routerDefinition: spec } = require('blind-peer-encodings')
const ScopeLock = require('scope-lock')
const IdEnc = require('hypercore-id-encoding')

class RawHyperDB extends ReadyResource {
  constructor(store) {
    super()

    this.store = store
    this.db = HyperDB.bee2(this.store, spec)
    this._flushTimer = null
    this.lock = new ScopeLock({ debounce: true })

    this._pendingBatch = new Map()
  }

  async _open() {
    await this.store.ready()
    await this.db.ready()

    this._flushTimer = setInterval(() => {
      if (this._pendingBatch.size === 0) return
      this._flush()
    }, 100)
    this._flushTimer.unref()
  }

  async _close() {
    clearInterval(this._flushTimer)

    await this.db.flush()
    await this.db.close()
  }

  async read(key) {
    return this.db.get('@blind-peer-router/assignment', { key })
  }

  async write(key, peers) {
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    const normKey = IdEnc.normalize(key)
    this._pendingBatch.set(normKey, ['@blind-peer-router/assignment', { key, peers }])

    return false
  }

  async getAndInsert(key, peers) {
    await this.db.get('@blind-peer-router/assignment', { key })
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    const normKey = IdEnc.normalize(key)
    this._pendingBatch.set(normKey, ['@blind-peer-router/assignment', { key, peers }])

    return false
  }

  async _flush() {
    if (!(await this.lock.lock())) return
    try {
      const batch = this._pendingBatch
      this._pendingBatch = new Map()
      await this.db.insertAll(batch.values())
      await this.db.flush()
    } finally {
      this.lock.unlock()
    }
  }
}

module.exports = RawHyperDB
