const ReadyResource = require("ready-resource");
const HyperDB = require("hyperdb");
const BlindPeering = require("blind-peering");

const spec = require("./spec/hyperdb");
const { resolveStruct } = require("./spec/hyperschema");
const GetPeersRequest = resolveStruct("@blind-peer-router/get-peers-request");
const GetPeersResponse = resolveStruct("@blind-peer-router/get-peers-response");

class BlindPeerRouter extends ReadyResource {
  /**
   * @param {Corestore} store
   * @param {Hyperswarm} swarm
   * @param {ProtomuxRPCRouter} router
   * @param {object} opts
   * @param {Buffer[]} opts.blindPeerKeys - blind peer public keys
   * @param {number} [opts.replicaCount=1] - peers to assign per key
   */
  constructor(store, swarm, router, { blindPeerKeys, replicaCount = 1 } = {}) {
    super();

    this.store = store;
    this.swarm = swarm;
    this.router = router;
    this.blindPeerKeys = blindPeerKeys;
    this.replicaCount = Math.min(replicaCount, blindPeerKeys.length);
    this._counter = 0;

    this.db = HyperDB.bee2(this.store, spec);

    this.peering = new BlindPeering(this.swarm, this.store, {
      mirrors: this.blindPeerKeys,
    });

    this.router.method(
      "get-peers",
      { requestEncoding: GetPeersRequest, responseEncoding: GetPeersResponse },
      this._onGetPeers.bind(this),
    );
  }

  /** @returns {Buffer} swarm public key for client discovery */
  get publicKey() {
    return this.swarm.keyPair.publicKey;
  }

  /** Opens db, router, and joins the swarm. */
  async _open() {
    await this.store.ready();
    await this.db.ready();
    await this.router.ready();

    this.swarm.on("connection", (conn) => {
      this.store.replicate(conn);
      this.router.handleConnection(conn, this.swarm.keyPair.publicKey);
    });

    await this.swarm.listen();
    this.swarm.join(this.db.core.discoveryKey);
  }

  /** Closes peering, router, and db. Caller owns swarm/store teardown. */
  async _close() {
    await this.peering.close();
    await this.router.close();
    await this.db.close();
  }

  /** RPC handler: returns existing peers or assigns new ones via blind-peering. */
  async _onGetPeers(req) {
    const key = req.key;

    const existing = await this.db.get("@blind-peer-router/assignment", {
      key,
    });
    if (existing) {
      return { peers: existing.peers };
    }

    const peers = this._pickPeers();

    const core = this.store.get({ key });
    await core.ready();

    this.peering.addCoreBackground(core, key, {
      mirrors: peers,
      pick: peers.length,
    });

    await this.db.insert("@blind-peer-router/assignment", { key, peers });
    await this.db.flush();

    return { peers };
  }

  /** @returns {Buffer[]} round-robin selected blind peer keys. */
  _pickPeers() {
    const peers = [];
    for (let i = 0; i < this.replicaCount; i++) {
      peers.push(
        this.blindPeerKeys[this._counter++ % this.blindPeerKeys.length],
      );
    }
    return peers;
  }
}

module.exports = BlindPeerRouter;
