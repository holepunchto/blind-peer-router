const ReadyResource = require('ready-resource')
const Hyperbee2 = require('hyperbee2')

class RawBee2 extends ReadyResource {
  constructor(store) {
    super()

    this.store = store
    this.db = new Hyperbee2(store)
    this.batch = null
  }

  async _open() {
    await this.store.ready()
    await this.db.ready()
  }

  async _close() {
    await this.batch?.flush()
    await this.db.close()
  }

  async insert(key, value) {
    await this.db.get(key)

    if (!this.batch) {
      this.batch = this.db.write()
    }
    this.batch.tryPut(key, value)

    if (this.batch.ops.length > 1000) {
      await this.batch.flush()
      this.batch = this.db.write()
      return true
    }

    return false
  }
}

module.exports = RawBee2
