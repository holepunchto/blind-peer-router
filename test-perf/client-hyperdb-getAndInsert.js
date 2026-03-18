/*
Run: node client-hyperdb-getAndInsert.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')

const RawHyperDB = require('./raw-hyperdb')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-hyperdb-getAndInsert'
const COUNT_RUNS = 100000
const LOG_INTERVAL = 1000

async function main() {
  const store = new Corestore(storage)
  const stats = createStats()
  const service = new RawHyperDB(store, { onflush: (ms) => stats.pushFlush(ms) })
  goodbye(() => service.close())
  await service.ready()
  const globalStart = process.hrtime()

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)

    const start = process.hrtime()
    await service.getAndInsert(coreKey, [{ key: crypto.randomBytes(32) }])
    const elapsed = hrtimeMs(start)

    stats.pushOp(elapsed)

    if ((i + 1) % LOG_INTERVAL === 0) {
      stats.report(`getAndInsert ${i + 1 - LOG_INTERVAL + 1}-${i + 1}`)
      stats.reset()
      await new Promise(resolve => setImmediate(resolve)) // yield event loop
    }
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${COUNT_RUNS} getAndInserts in ${(totalMs / 1000).toFixed(2)}s (${(COUNT_RUNS / (totalMs / 1000)).toFixed(0)} ops/s)`
  )
}

main()
