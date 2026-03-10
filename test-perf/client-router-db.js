const crypto = require('hypercore-crypto')
const ProtomuxRPCRouter = require('protomux-rpc-router')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const b4a = require('b4a')
const BlindPeerRouter = require('..')

const COUNT_RUNS = 100000
const CONCURRENCY = 1000
const LOG_INTERVAL = 1000

async function main() {
  const store = new Corestore('client-router-db-test-corestore')
  const swarm = new Hyperswarm()
  const protomuxRpcRouter = new ProtomuxRPCRouter()
  const blindPeers = [
    { key: b4a.from('a'.repeat(64), 'hex') },
    { key: b4a.from('4'.repeat(64), 'hex') },
    { key: b4a.from('e'.repeat(64), 'hex') }
  ]
  const service = new BlindPeerRouter(store, swarm, protomuxRpcRouter, { blindPeers })

  console.time('main')

  let batch = []
  for (let i = 0; i < COUNT_RUNS; i++) {
    const key = crypto.randomBytes(32)
    batch.push(service.resolvePeers(key))

    if (batch.length === CONCURRENCY) {
      await Promise.all(batch)
      batch = []
      // give time to flush
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    if (i % LOG_INTERVAL === 0) {
      console.log(`Requested ${i}`)
    }
  }

  await Promise.all(batch)

  console.timeEnd('main')

  let nrEntries = 0
  for await (const _ of service.list()) nrEntries++
  console.log('total entries', nrEntries)

  console.log('waiting for an additional flush...')
  await new Promise((resolve) => setTimeout(resolve, 2000))

  nrEntries = 0
  for await (const _ of service.list()) nrEntries++
  console.log('total entries', nrEntries)

  await swarm.destroy()
  await service.close()
}

main()
