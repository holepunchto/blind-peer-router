const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const { routerDefinition: spec } = require('blind-peer-encodings')

class RawHyperDB extends ReadyResource {
  constructor(store) {
    super()

    this.store = store
    this.db = HyperDB.bee2(this.store, spec)
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
    const timeKey = `${key}-${Date.now()}`
    console.time(timeKey)
    await this.db.get('@blind-peer-router/assignment', { key })
    console.timeEnd(timeKey)
  }

  async write(key, peers) {
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.db.updates.size > 1000) {
      const timeKey = `flush-${this.db.updates.size}-${key.toString('hex')}-${Date.now()}`
      console.time(timeKey)
      await this.db.flush()
      console.timeEnd(timeKey)
    }
  }

  async insert(key, peers) {
    await this.db.get('@blind-peer-router/assignment', { key })
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.db.updates.size > 1000) {
      const timeKey = `flush-${this.db.updates.size}-${key.toString('hex')}-${Date.now()}`
      console.time(timeKey)
      await this.db.flush()
      console.timeEnd(timeKey)
    }
  }
}

module.exports = RawHyperDB
