/*
Run: node client-hyperdb-concurrent.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')

const RawHyperDB = require('./raw-hyperdb')

const storage = './storage-raw-hyperdb-concurrent'
const COUNT_RUNS = 100000
const CHUNK_SIZE = 100

async function main() {
  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < COUNT_RUNS; i += CHUNK_SIZE) {
    await Promise.all(
      Array.from({ length: CHUNK_SIZE }, async () => {
        const coreKey = crypto.randomBytes(32)
        await service.getAndInsert(coreKey, [{ key: crypto.randomBytes(32) }])
      })
    )
    console.log(i + CHUNK_SIZE, 'OK')
  }

  await service.close()

  console.timeEnd('main')
}

main()
