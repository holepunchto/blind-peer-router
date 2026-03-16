const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const { routerDefinition: spec } = require('blind-peer-encodings')
const ScopeLock = require('scope-lock')

class RawHyperDB extends ReadyResource {
  constructor(store) {
    super()

    this.store = store
    this.db = HyperDB.bee2(this.store, spec)
    this.lock = new ScopeLock({ debounce: true })
  }

  async _open() {
    await this.store.ready()
    await this.db.ready()
  }

  async _close() {
    await this.db.flush()
    await this.db.close()
  }

  async read(key) {
    return this.db.get('@blind-peer-router/assignment', { key })
  }

  async write(key, peers) {
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.db.updates.size > 1000) {
      await this._flush()
      return true
    }

    return false
  }

  async getAndInsert(key, peers) {
    await this.db.get('@blind-peer-router/assignment', { key })
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.db.updates.size > 1000) {
      await this._flush()
      return true
    }

    return false
  }

  async _flush() {
    await this.lock.lock()
    try {
      await this.db.flush()
    } finally {
      this.lock.unlock()
    }
  }
}

module.exports = RawHyperDB
