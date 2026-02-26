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

    this.batch = this.db.write()
  }

  async _close() {
    await this.batch.flush()
    await this.db.close()
  }

  async insert(key, value) {
    await this.db.get(key)
    this.batch.tryPut(key, value)

    if (this.batch.ops.length > 1000) {
      const key = `flush-${this.batch.ops.length}-${Date.now()}`
      console.time(key)
      await this.batch.flush()
      console.timeEnd(key)
      this.batch = this.db.write()
    }
  }
}

module.exports = RawBee2
