/*
Run:
  node client-hyperdb-write.js (run once only)
  node client-hyperdb-read.js
*/

const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs').promises
const goodbye = require('graceful-goodbye')

const RawHyperDB = require('./raw-hyperdb')
const { createStats, hrtimeMs } = require('./stats')

const storage = './storage-hyperdb-write'
const LOG_INTERVAL = 1000

async function main() {
  const keys = JSON.parse(await fs.readFile('storage-keys.txt', 'utf8')).map(IdEnc.decode)

  const store = new Corestore(storage)
  const service = new RawHyperDB(store)
  goodbye(() => service.close())
  await service.ready()

  const stats = createStats()
  const globalStart = process.hrtime()

  for (let i = 0; i < keys.length; i += 1) {
    const coreKey = keys[i]

    const start = process.hrtime()
    await service.read(coreKey)
    stats.pushOp(hrtimeMs(start))

    if ((i + 1) % LOG_INTERVAL === 0) {
      stats.report(`read ${i + 1 - LOG_INTERVAL + 1}-${i + 1}`)
      stats.reset()
    }
    if (i % 100 === 0) {
      await new Promise((resolve) => setImmediate(resolve)) // yield event loop
    }
  }

  await service.close()

  const totalMs = hrtimeMs(globalStart)
  console.log(
    `\ntotal: ${keys.length} reads in ${(totalMs / 1000).toFixed(2)}s (${(keys.length / (totalMs / 1000)).toFixed(0)} ops/s)`
  )
}

main()
