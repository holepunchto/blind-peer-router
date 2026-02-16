#!/usr/bin/env node

const path = require('path')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const ProtomuxRPCRouter = require('protomux-rpc-router')
const defaultMiddleware = require('protomux-rpc-middleware')
const IdEnc = require('hypercore-id-encoding')
const goodbye = require('graceful-goodbye')
const { command, flag } = require('paparam')
const pino = require('pino')

const BlindPeerRouter = require('.')

const runCmd = command(
  'run',
  flag('--storage|-s [path]', 'storage path, defaults to ./blind-peer-router'),
  flag('--blind-peer|-b <key>', 'blind peer public key (repeatable, z32 or hex)').multiple(),
  flag('--replica-count|-r [count]', 'peers per key, defaults to 1'),

  async function ({ flags }) {
    const logger = pino({ name: 'blind-peer-router' })
    const storage = path.resolve(flags.storage || 'blind-peer-router')

    const rawPeers = flags.blindPeer ?? []
    if (rawPeers.length === 0) {
      logger.error('At least one --blind-peer is required')
      process.exit(1)
    }

    const blindPeerKeys = rawPeers.map((k) => IdEnc.decode(k))
    const replicaCount = flags.replicaCount ? parseInt(flags.replicaCount) : 1

    logger.info(`Using storage: ${storage}`)
    logger.info(`Blind peers: ${rawPeers.length}`)
    logger.info(`Replica count: ${replicaCount}`)

    const store = new Corestore(storage)
    const swarm = new Hyperswarm({
      keyPair: await store.createKeyPair('swarm-key')
    })

    const router = new ProtomuxRPCRouter()
    router.use(defaultMiddleware({ logger: { instance: logger } }))

    const service = new BlindPeerRouter(store, swarm, router, {
      blindPeerKeys,
      replicaCount
    })

    goodbye(async () => {
      logger.info('Shutting down blind-peer-router service')
      await service.close()
      await swarm.destroy()
      await store.close()
    })

    logger.info('Starting blind-peer-router service')
    await service.ready()

    logger.info(`Public key: ${IdEnc.normalize(service.publicKey)}`)
    logger.info(`DB key: ${IdEnc.normalize(service.db.core.key)}`)
  }
)

const cmd = command('blind-peer-router', runCmd)

cmd.parse()
