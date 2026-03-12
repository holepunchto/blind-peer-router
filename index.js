const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const xorDistance = require('xor-distance')
const ScopeLock = require('scope-lock')
const safetyCatch = require('safety-catch')
const IdEnc = require('hypercore-id-encoding')

const {
  routerDefinition: routerSpec,
  RouterResolvePeersRequest,
  RouterResolvePeersResponse
} = require('blind-peer-encodings')

class BlindPeerRouter extends ReadyResource {
  /**
   * @param {import('corestore')} store
   * @param {import('hyperswarm')} swarm
   * @param {import('protomux-rpc-router')} router
   * @param {object} opts
   * @param {{
   *   key: Buffer,
   *   location?: string
   * }[]} opts.blindPeers - blind peers
   * @param {number} [opts.replicaCount=1] - peers to assign per key
   * @param {boolean} [opts.autoFlush=false] - flush immediately on each insert
   * @param {number} [opts.flushInterval=1000] - flush interval in ms (when autoFlush is false)
   */
  constructor(
    store,
    swarm,
    router,
    { blindPeers, replicaCount = 1, flushInterval = 1000, maxBatchSize = 1000 } = {}
  ) {
    super()

    this.store = store
    this.swarm = swarm
    this.router = router
    this.blindPeers = blindPeers

    if (replicaCount > blindPeers.length) {
      throw new Error('Insufficient blind peers to satisfy replica requirement')
    }
    this.replicaCount = replicaCount

    this.flushInterval = flushInterval
    this.maxBatchSize = maxBatchSize
    this.overloaded = false
    this.stats = { flushes: 0, inserts: 0 }

    this.db = HyperDB.bee2(this.store, routerSpec)
    this._flushTimer = null
    this.lock = new ScopeLock({ debounce: true })

    this._pendingBatch = new Map()

    this.router.method(
      'resolve-peers',
      {
        requestEncoding: RouterResolvePeersRequest,
        responseEncoding: RouterResolvePeersResponse
      },
      this._onResolvePeers.bind(this)
    )
  }

  /** @returns {Buffer} swarm public key for client discovery */
  get publicKey() {
    return this.swarm.keyPair.publicKey
  }

  async _open() {
    await this.store.ready()
    await this.db.ready()
    await this.router.ready()

    this._flushTimer = setInterval(() => {
      if (this._pendingBatch.size === 0) return
      this._flush()
    }, this.flushInterval)
    this._flushTimer.unref()

    this.swarm.on('connection', (conn) => {
      this.store.replicate(conn)
      this.router.handleConnection(conn, this.swarm.keyPair.publicKey)
    })

    await this.swarm.listen()
    this.swarm.join(this.db.core.discoveryKey)
  }

  async _close() {
    clearInterval(this._flushTimer)

    await this.router.close()
    await this._flush()
    await this.db.close()
  }

  async _flush() {
    // not allowed to throw
    if (!(await this.lock.lock())) return

    try {
      const batch = this._pendingBatch
      this._pendingBatch = new Map()
      await this.db.insertAll(batch.values())
      await this.db.flush()
      this.stats.flushes++
      this.overloaded = this._pendingBatch.size >= this.maxBatchSize
      this.emit('flushed')
    } catch (e) {
      this.emit('flush-error', e)
      safetyCatch(e)
    } finally {
      this.lock.unlock()
    }
  }

  async _onResolvePeers(req) {
    return await this.resolvePeers(req.key)
  }

  async resolvePeers(key) {
    if (this.overloaded) throw new Error('Overloaded')
    if (!this.opened) await this.ready()

    const normKey = IdEnc.normalize(key)
    const batched = this._pendingBatch.get(normKey)
    if (batched) {
      return { peers: batched[1].peers }
    }

    const existing = await this.db.get('@blind-peer-router/assignment', {
      key
    })
    if (existing) {
      return { peers: existing.peers }
    }

    // Note: when we are actually overloaded, many requests will reach here ~simultaneously
    if (this._pendingBatch.size >= this.maxBatchSize) {
      this.overloaded = true
      this._flush()
      throw new Error('Overloaded')
    }

    const blindPeerKeys = this.blindPeers.map((p) => p.key)
    const peerKeys = getClosestMirrorList(key, blindPeerKeys, this.replicaCount)
    const peers = this.blindPeers.filter((p) => peerKeys.includes(p.key))

    // Note: this is prone to race conditions, but our assignment function
    // is determinstic, so it doesn't matter in prpromsactice (we might insert
    // the same key-value pair multiple times)
    this._pendingBatch.set(normKey, ['@blind-peer-router/assignment', { key, peers }])
    this.stats.inserts++

    return { peers }
  }

  list(query = {}, opts = {}) {
    return this.db.find('@blind-peer-router/assignment', query, opts)
  }
}

/** Get the closest n peers by XOR distance to key.
 * @param {Buffer} key
 * @param {Buffer[]} list
 * @param {number} n
 * @returns {Buffer[]}
 */
function getClosestMirrorList(key, list, n) {
  if (!list || !list.length) return []

  if (n > list.length) n = list.length

  for (let i = 0; i < n; i++) {
    let current = null
    for (let j = i; j < list.length; j++) {
      const next = xorDistance(list[j], key)
      if (current && xorDistance.gt(next, current)) continue
      const tmp = list[i]
      list[i] = list[j]
      list[j] = tmp
      current = next
    }
  }

  return list.slice(0, n)
}

module.exports = BlindPeerRouter
