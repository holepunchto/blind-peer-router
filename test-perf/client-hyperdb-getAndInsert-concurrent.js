/*
Run: node client-hyperdb-getAndInsert-concurrent.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')

const RawHyperDB = require('./raw-hyperdb')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-hyperdb-getAndInsert-concurrent'
const COUNT_RUNS = 100000
const CHUNK_SIZE = 100

async function main() {
  const store = new Corestore(storage)
  const stats = createStats()
  const service = new RawHyperDB(store, { onflush: (ms) => stats.pushFlush(ms) })
  goodbye(() => service.close())
  await service.ready()
  const globalStart = process.hrtime()

  for (let i = 0; i < COUNT_RUNS; i += CHUNK_SIZE) {
    // const batchStart = process.hrtime()

    await Promise.all(
      Array.from({ length: CHUNK_SIZE }, async () => {
        const coreKey = crypto.randomBytes(32)
        const start = process.hrtime()
        await service.getAndInsert(coreKey, [{ key: crypto.randomBytes(32) }])
        const elapsed = hrtimeMs(start)

        stats.pushOp(elapsed)
      })
    )

    const done = i + CHUNK_SIZE
    // const batchMs = hrtimeMs(batchStart)
    // console.log(
    //   `batch ${done}: ${CHUNK_SIZE} ops in ${batchMs.toFixed(1)}ms (${(CHUNK_SIZE / (batchMs / 1000)).toFixed(0)} ops/s)`
    // )

    if (done % 1000 === 0) {
      stats.report(`getAndInsert ${done - 1000 + 1}-${done}`)
      stats.reset()
    }
    await new Promise((resolve) => setImmediate(resolve)) // yield event loop
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${COUNT_RUNS} getAndInserts in ${(totalMs / 1000).toFixed(2)}s (${(COUNT_RUNS / (totalMs / 1000)).toFixed(0)} ops/s)`
  )
}

main()
