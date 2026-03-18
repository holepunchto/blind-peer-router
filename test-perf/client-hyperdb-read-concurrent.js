/*
Run:
  node client-hyperdb-write.js (run once only)
  node client-hyperdb-read-concurrent.js
*/

const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises

const RawHyperDB = require('./raw-hyperdb')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-hyperdb-write'
const CHUNK_SIZE = 100

async function main() {
  const keys = JSON.parse(await fs.readFile('storage-keys.txt', 'utf8')).map(IdEnc.decode)

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  const stats = createStats()
  const globalStart = process.hrtime()

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    // const batchStart = process.hrtime()

    await Promise.all(
      Array.from({ length: CHUNK_SIZE }, async (v, k) => {
        const coreKey = keys[i + k]

        const start = process.hrtime()
        await service.read(coreKey)
        stats.pushOp(hrtimeMs(start))
      })
    )

    const done = i + CHUNK_SIZE
    // const batchMs = hrtimeMs(batchStart)
    // console.log(
    //   `batch ${done}: ${CHUNK_SIZE} ops in ${batchMs.toFixed(1)}ms (${(CHUNK_SIZE / (batchMs / 1000)).toFixed(0)} ops/s)`
    // )

    if (done % 1000 === 0) {
      stats.report(`read ${done - 1000 + 1}-${done}`)
      stats.reset()
    }
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${keys.length} reads in ${(totalMs / 1000).toFixed(2)}s (${(keys.length / (totalMs / 1000)).toFixed(0)} ops/s)`
  )
}

main()
