/*
Run: 
  node client-hyperdb-write-100k.js
  node client-hyperdb-read-100k-concurrent.js
*/

const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises

const RawHyperDB = require('./raw-hyperdb')

const storage = './storage-raw-hyperdb-100k'
const CHUNK_SIZE = 100

async function main() {
  const keys = JSON.parse(await fs.readFile('storage-100k.txt', 'utf8')).map(IdEnc.decode)

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  console.time('main')

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    await Promise.all(
      Array.from({ length: CHUNK_SIZE }, async (v, k) => {
        const coreKey = keys[k]
        await service.read(coreKey)
      })
    )
    console.log(i + CHUNK_SIZE, 'OK')
  }

  await service.close()

  console.timeEnd('main')
}

main()
