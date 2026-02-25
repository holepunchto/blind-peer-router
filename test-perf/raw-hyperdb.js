const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const spec = require('../spec/hyperdb')

class BlindPeerRouter extends ReadyResource {
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

  async insert(key, peers) {
    await this.db.get('@blind-peer-router/assignment', {
      key
    })
    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.db.updates.size > 1000) {
      const key = `flush-${this.db.updates.size}-${Date.now()}`
      console.time(key)
      await this.db.flush()
      console.timeEnd(key)
    }
  }
}

module.exports = BlindPeerRouter
