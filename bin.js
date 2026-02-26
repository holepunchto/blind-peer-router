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
const HyperInstrument = require('hyper-instrument')

const BlindPeerRouter = require('.')

const SERVICE_NAME = 'blind-peer-router'

const runCmd = command(
  'run',
  flag('--storage|-s [path]', 'storage path, defaults to ./blind-peer-router'),
  flag('--blind-peer|-b <key>', 'blind peer public key (repeatable, z32 or hex)').multiple(),
  flag('--replica-count|-r [count]', 'peers per key, defaults to 1'),
  flag('--scraper-public-key <scraperPublicKey>', 'Public key of a dht-prometheus scraper'),
  flag('--scraper-secret <scraperSecret>', 'Secret of the dht-prometheus scraper'),
  flag('--scraper-alias <scraperAlias>', '(Optional) Alias of scraper service'),

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

    const { scraperPublicKey, scraperSecret, scraperAlias } = flags
    const instrumentation = await registerScraper(service, logger, scraperPublicKey, scraperSecret, scraperAlias)
    
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
