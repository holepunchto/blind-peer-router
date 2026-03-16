/*
Run: node client-bee2.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')

const RawBee2 = require('./raw-bee2')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-raw-bee2'
const COUNT_RUNS = 100000
const LOG_INTERVAL = 1000

async function main() {
  const store = new Corestore(storage)
  const service = new RawBee2(store)
  await service.ready()

  const stats = createStats()
  const globalStart = process.hrtime()

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)

    const start = process.hrtime()
    await service.insert(coreKey, crypto.randomBytes(32))
    stats.push(hrtimeMs(start))

    if ((i + 1) % LOG_INTERVAL === 0) {
      stats.report(`insert ${i + 1 - LOG_INTERVAL + 1}-${i + 1}`)
      stats.reset()
    }
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${COUNT_RUNS} inserts in ${(totalMs / 1000).toFixed(2)}s (${(COUNT_RUNS / (totalMs / 1000)).toFixed(0)} ops/s)`
  )
}

main()
