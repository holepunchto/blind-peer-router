/*
Run: node client-hyperdb-write.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises

const RawHyperDB = require('./raw-hyperdb')

const storage = './storage-hyperdb-write'
const COUNT_RUNS = 100000

async function main() {
  const keys = []

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)
    keys.push(coreKey)
    await service.write(coreKey, [{ key: crypto.randomBytes(32) }])
    if (i % 1000 === 0) {
      console.log(i, 'OK')
    }
  }

  await service.close()

  console.timeEnd('main')

  await fs.writeFile('storage-keys.txt', JSON.stringify(keys.map(IdEnc.normalize)), 'utf8')
}

main()
