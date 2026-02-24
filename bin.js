#!/usr/bin/env node

const fs = require('fs').promises
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

const DEFAULT_CONFIG_PATH = './config.json'
const DEFAULT_STORAGE_PATH = './storage'

const runCmd = command(
  'run',
  flag('--config|-c [path]', `config path, defaults to ${DEFAULT_CONFIG_PATH}`),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE_PATH}`),
  flag('--replica-count|-r [count]', 'peers per key, defaults to 1'),

  async function ({ flags }) {
    const logger = pino({ name: 'blind-peer-router' })

    const config = JSON.parse(await fs.readFile(flags.config || DEFAULT_CONFIG_PATH, 'utf-8'))
    const blindPeers = Object.entries(config.blindPeers).map(([k, v]) => ({ ...v, key: IdEnc.decode(k) }))
    if (!blindPeers.length) {
      logger.error('At least one blind-peer is required')
      process.exit(1)
    }
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE_PATH)
    const replicaCount = flags.replicaCount ? parseInt(flags.replicaCount) : 1

    logger.info(`Using storage: ${storage}`)
    logger.info(`Blind peers: ${blindPeers.length}`)
    logger.info(`Replica count: ${replicaCount}`)

    const store = new Corestore(storage)
    const swarm = new Hyperswarm({
      keyPair: await store.createKeyPair('swarm-key')
    })

    const router = new ProtomuxRPCRouter()
    router.use(defaultMiddleware({ logger: { instance: logger } }))

    const service = new BlindPeerRouter(store, swarm, router, {
      blindPeers,
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
