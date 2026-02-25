const ReadyResource = require('ready-resource')
const HyperDB = require('hyperdb')
const xorDistance = require('xor-distance')
const ScopeLock = require('scope-lock')

const spec = require('./spec/hyperdb')
const { resolveStruct } = require('./spec/hyperschema')
const ResolvePeersRequest = resolveStruct('@blind-peer-router/resolve-peers-request')
const ResolvePeersResponse = resolveStruct('@blind-peer-router/resolve-peers-response')

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
    { blindPeers, replicaCount = 1, autoFlush = false, flushInterval = 1_000 } = {}
  ) {
    super()

    this.store = store
    this.swarm = swarm
    this.router = router
    this.blindPeers = blindPeers
    this.replicaCount = Math.min(replicaCount, blindPeers.length)
    this.autoFlush = autoFlush
    this.flushInterval = flushInterval

    this.db = HyperDB.bee2(this.store, spec)
    this._flushTimer = null
    this._pendingFlush = false

    this.router.method(
      'resolve-peers',
      {
        requestEncoding: ResolvePeersRequest,
        responseEncoding: ResolvePeersResponse
      },
      this._onResolvePeers.bind(this)
    )
  }

  /** @returns {Buffer} swarm public key for client discovery */
  get publicKey() {
    return this.swarm.keyPair.publicKey
  }

  /** Opens db, router, and joins the swarm. */
  async _open() {
    await this.store.ready()
    await this.db.ready()
    await this.router.ready()

    const lock = new ScopeLock({ debounce: true })
    async function flush() {
      if ((await lock.lock()) === false) return
      await db.flush().catch(noop)
      lock.unlock()
    }

    if (!this.autoFlush) {
      this._flushTimer = setInterval(() => {
        if (!this._pendingFlush) return
        this._pendingFlush = false
        flush()
      }, this.flushInterval)
      this._flushTimer.unref()
    }

    this.swarm.on('connection', (conn) => {
      this.store.replicate(conn)
      this.router.handleConnection(conn, this.swarm.keyPair.publicKey)
    })

    await this.swarm.listen()
    this.swarm.join(this.db.core.discoveryKey)
  }

  /** Closes router and db. Caller owns swarm/store teardown. */
  async _close() {
    if (this._flushTimer !== null) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }

    await this.router.close()
    if (this._pendingFlush) {
      this._pendingFlush = false
      await this.db.flush()
    }
    await this.db.close()
  }

  /** RPC handler: returns existing peers or resolves closest peers for key. */
  async _onResolvePeers(req) {
    const key = req.key

    const existing = await this.db.get('@blind-peer-router/assignment', {
      key
    })
    if (existing) {
      return { peers: existing.peers }
    }

    const blindPeerKeys = this.blindPeers.map((p) => p.key)
    const peerKeys = getClosestMirrorList(key, blindPeerKeys, this.replicaCount)
    const peers = this.blindPeers.filter((p) => peerKeys.includes(p.key))

    await this.db.insert('@blind-peer-router/assignment', { key, peers })

    if (this.autoFlush) {
      await this.db.flush()
    } else {
      this._pendingFlush = true
    }

    return { peers }
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

function noop() {}

module.exports = BlindPeerRouter
