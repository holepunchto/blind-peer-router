/*
Run: node client-hyperdb-write-100k.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')

const RawHyperDB = require('./raw-hyperdb')

const storage = './storage-raw-hyperdb-100k'
const COUNT_RUNS = 100000

async function main() {
  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)
    await service.write(coreKey, [{ key: crypto.randomBytes(32) }])
    if (i % 1000 === 0) {
      console.log(i, 'OK')
    }
  }

  await service.close()

  console.timeEnd('main')
}

main()
