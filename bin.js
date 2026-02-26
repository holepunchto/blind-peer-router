#!/usr/bin/env node

const fs = require('fs').promises
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const ProtomuxRPCRouter = require('protomux-rpc-router')
const defaultMiddleware = require('protomux-rpc-middleware')
const IdEnc = require('hypercore-id-encoding')
const goodbye = require('graceful-goodbye')
const { command, flag } = require('paparam')
const pino = require('pino')
const HyperInstrument = require('hyper-instrument')

const BlindPeerRouter = require('.')

const SERVICE_NAME = 'blind-peer-router'
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.blind-peer-router', 'config.json')
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), '.blind-peer-router', 'storage')

const runCmd = command(
  'run',
  flag('--config|-c [path]', `config path, defaults to ${DEFAULT_CONFIG_PATH}`),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE_PATH}`),
  flag('--replica-count|-r [count]', 'peers per key, defaults to 1'),
  flag('--scraper-public-key <scraperPublicKey>', 'Public key of a dht-prometheus scraper'),
  flag('--scraper-secret <scraperSecret>', 'Secret of the dht-prometheus scraper'),
  flag('--scraper-alias <scraperAlias>', '(Optional) Alias of scraper service'),

  async function ({ flags }) {
    const logger = pino({ name: 'blind-peer-router' })

    const configPath = path.resolve(flags.config || DEFAULT_CONFIG_PATH)
    logger.info(`Reading config from: ${configPath}`)
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'))

    const blindPeers = Object.entries(config.blindPeers).map(([k, v]) => ({
      key: IdEnc.decode(k),
      location: v.location
    }))
    if (!blindPeers.length) {
      logger.error('At least one blind-peer is required')
      process.exit(1)
    }
    logger.info(`Blind peers: ${blindPeers.length}`)

    const storage = path.resolve(flags.storage || DEFAULT_STORAGE_PATH)
    logger.info(`Using storage: ${storage}`)

    const replicaCount = flags.replicaCount ? parseInt(flags.replicaCount) : 1
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

    const { scraperPublicKey, scraperSecret, scraperAlias } = flags
    const instrumentation = await registerScraper(
      service,
      logger,
      scraperPublicKey,
      scraperSecret,
      scraperAlias
    )

    goodbye(async () => {
      logger.info('Shutting down blind-peer-router service')
      if (instrumentation) await instrumentation.close()
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

/** @type {function(BlindPeerRouter, Logger, string, string, string)} */
async function registerScraper(service, logger, scraperPublicKey, scraperSecret, scraperAlias) {
  if (!scraperPublicKey || !scraperSecret) {
    return
  }
  logger.info('Registering scraper')

  const instrumentation = new HyperInstrument({
    swarm: service.swarm,
    corestore: service.store,
    scraperPublicKey,
    scraperSecret,
    prometheusServiceName: SERVICE_NAME,
    prometheusAlias:
      scraperAlias || `${SERVICE_NAME}-${IdEnc.normalize(service.swarm.keyPair.publicKey)}`,
    version: require('./package.json').version
  })
  instrumentation.registerLogger(logger)
  await instrumentation.ready()
  return instrumentation
}

const cmd = command('blind-peer-router', runCmd)

cmd.parse()
