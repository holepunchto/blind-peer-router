/*
Run: 
  node client-hyperdb-write-100k.js
  node client-hyperdb-read-100k.js
*/

const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises

const RawHyperDB = require('./raw-hyperdb')

const storage = './storage-raw-hyperdb-100k'

async function main() {
  const keys = JSON.parse(await fs.readFile('storage-100k.txt', 'utf8')).map(IdEnc.decode)

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < keys.length; i += 1) {
    const coreKey = keys[0]
    await service.read(coreKey)
    if (i % 1000 === 0) {
      console.log(i, 'OK')
    }
  }

  await service.close()

  console.timeEnd('main')
}

main()
