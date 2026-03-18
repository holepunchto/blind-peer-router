/*
Run: node client-hyperdb-write.js
*/

const crypto = require('hypercore-crypto')
const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises

const RawHyperDB = require('./raw-hyperdb')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-hyperdb-write'
const COUNT_RUNS = 100000
const LOG_INTERVAL = 1000

async function main() {
  const keys = []

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  await service.ready()

  const stats = createStats()
  const globalStart = process.hrtime()

  for (let i = 0; i < COUNT_RUNS; i += 1) {
    const coreKey = crypto.randomBytes(32)
    keys.push(coreKey)

    const start = process.hrtime()
    await service.write(coreKey, [{ key: crypto.randomBytes(32) }])
    const elapsed = hrtimeMs(start)

    stats.pushOp(elapsed)

    if ((i + 1) % LOG_INTERVAL === 0) {
      stats.report(`write ${i + 1 - LOG_INTERVAL + 1}-${i + 1}`)
      stats.reset()
    }
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${COUNT_RUNS} writes in ${(totalMs / 1000).toFixed(2)}s (${(COUNT_RUNS / (totalMs / 1000)).toFixed(0)} ops/s)`
  )

  await fs.writeFile('storage-keys.txt', JSON.stringify(keys.map(IdEnc.normalize)), 'utf8')
}

main()
