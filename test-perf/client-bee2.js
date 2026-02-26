/*
Run: node client-bee2.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')

const RawBee2 = require('./raw-bee2')

const storage = './storage-raw-bee2'
const COUNT_RUNS = 100000

async function main() {
  const store = new Corestore(storage)
  const service = new RawBee2(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)
    await service.insert(coreKey, crypto.randomBytes(32))
    if (i % 1000 === 0) {
      console.log(i, 'OK')
    }
  }

  await service.close()

  console.timeEnd('main')
}

main()
