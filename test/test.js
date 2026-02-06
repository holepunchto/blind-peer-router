const test = require("brittle");
const createTestnet = require("hyperdht/testnet");
const HyperDHT = require("hyperdht");
const Corestore = require("corestore");
const Hyperswarm = require("hyperswarm");
const ProtomuxRPC = require("protomux-rpc");
const ProtomuxRPCRouter = require("protomux-rpc-router");
const BlindPeer = require("blind-peer");
const tmpDir = require("test-tmp");
const b4a = require("b4a");
const IdEnc = require("hypercore-id-encoding");

const BlindPeerRouter = require("..");
const { resolveStruct } = require("../spec/hyperschema");
const GetPeersRequest = resolveStruct("@blind-peer-router/get-peers-request");
const GetPeersResponse = resolveStruct("@blind-peer-router/get-peers-response");

async function setupTestnet(t) {
  const testnet = await createTestnet();
  t.teardown(() => testnet.destroy());
  return testnet;
}

async function setupBlindPeer(t, bootstrap) {
  const storage = await tmpDir(t);

  const swarm = new Hyperswarm({ bootstrap });
  t.teardown(() => swarm.destroy());

  const peer = new BlindPeer(storage, { swarm, enableGc: false });
  t.teardown(() => peer.close());

  await peer.listen();
  return peer;
}

async function setupBlindPeers(t, bootstrap, count) {
  return Promise.all(
    Array.from({ length: count }, () => setupBlindPeer(t, bootstrap)),
  );
}

async function setupRoutingService(t, bootstrap, blindPeerKeys) {
  const storage = await tmpDir(t);

  const store = new Corestore(storage);
  t.teardown(() => store.close());

  const swarm = new Hyperswarm({
    keyPair: await store.createKeyPair("swarm-key"),
    bootstrap,
  });
  t.teardown(() => swarm.destroy());

  const router = new ProtomuxRPCRouter();
  t.teardown(() => router.close());

  const service = new BlindPeerRouter(store, swarm, router, {
    blindPeerKeys,
    replicaCount: 2,
  });
  t.teardown(() => service.close());

  await service.ready();
  return service;
}

async function setupClient(t, bootstrap, serverPublicKey) {
  const dht = new HyperDHT({ bootstrap });
  t.teardown(() => dht.destroy());

  const stream = dht.connect(serverPublicKey);
  t.teardown(() => stream.destroy());
  stream.on("error", () => {});
  await stream.opened;

  const rpc = new ProtomuxRPC(stream, {
    id: serverPublicKey,
    valueEncoding: null,
  });
  t.teardown(() => rpc.destroy());

  return rpc;
}

async function getPeers(rpc, key) {
  return rpc.request(
    "get-peers",
    { key },
    {
      requestEncoding: GetPeersRequest,
      responseEncoding: GetPeersResponse,
    },
  );
}

test("get-peers assigns blind peers for a new key", async (t) => {
  const { bootstrap } = await setupTestnet(t);

  const blindPeers = await setupBlindPeers(t, bootstrap, 5);

  const service = await setupRoutingService(
    t,
    bootstrap,
    blindPeers.map((bp) => bp.publicKey),
  );

  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xaa);
  const res = await getPeers(rpc, key);

  t.is(res.peers.length, 2, "assigns replicaCount peers");
  t.ok(
    res.peers.every((p) =>
      blindPeers.some((bp) => b4a.equals(p, bp.publicKey)),
    ),
    "assigned peers are from the configured blind peer list",
  );
});

test("get-peers returns same peers on second call", async (t) => {
  const { bootstrap } = await setupTestnet(t);

  const blindPeers = await setupBlindPeers(t, bootstrap, 5);

  const service = await setupRoutingService(
    t,
    bootstrap,
    blindPeers.map((bp) => bp.publicKey),
  );

  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xbb);
  const res1 = await getPeers(rpc, key);
  const res2 = await getPeers(rpc, key);

  const sort = (arr) => arr.map((p) => IdEnc.encode(p)).sort();
  t.alike(
    sort(res1.peers),
    sort(res2.peers),
    "same peers returned for same key",
  );
});

test("get-peers assigns different peers for different keys", async (t) => {
  const { bootstrap } = await setupTestnet(t);

  const blindPeers = await setupBlindPeers(t, bootstrap, 5);

  const service = await setupRoutingService(
    t,
    bootstrap,
    blindPeers.map((bp) => bp.publicKey),
  );

  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const keyA = b4a.alloc(32, 0x01);
  const keyB = b4a.alloc(32, 0x02);

  const resA = await getPeers(rpc, keyA);
  const resB = await getPeers(rpc, keyB);

  t.is(resA.peers.length, 2);
  t.is(resB.peers.length, 2);

  const all = [...resA.peers, ...resB.peers].map((p) => IdEnc.encode(p));
  const unique = new Set(all);
  t.is(unique.size, 4, "round-robin assigns no overlapping peers");
});

test("get-peers adds core to the correct blind peers", async (t) => {
  t.plan(3);

  const { bootstrap } = await setupTestnet(t);

  const blindPeers = [];
  for (let i = 0; i < 4; i++) {
    blindPeers.push(await setupBlindPeer(t, bootstrap));
  }

  const service = await setupRoutingService(
    t,
    bootstrap,
    blindPeers.map((bp) => bp.publicKey),
  );

  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xdd);

  for (const bp of blindPeers) {
    bp.on("add-core", (record) => {
      if (b4a.equals(record.key, key)) {
        t.ok(
          assignedPeerKeys.has(IdEnc.encode(bp.publicKey)),
          "only assigned blind peer received add-core",
        );
      }
    });
  }

  const res = await getPeers(rpc, key);
  const assignedPeerKeys = new Set(res.peers.map((p) => IdEnc.encode(p)));

  t.is(assignedPeerKeys.size, 2, "assigned 2 blind peers");
});

test("replicaCount is capped to number of blind peers", async (t) => {
  const { bootstrap } = await setupTestnet(t);

  const bp1 = await setupBlindPeer(t, bootstrap);

  const storage = await tmpDir(t);

  const store = new Corestore(storage);
  t.teardown(() => store.close());

  const swarm = new Hyperswarm({
    keyPair: await store.createKeyPair("swarm-key"),
    bootstrap,
  });
  t.teardown(() => swarm.destroy());

  const router = new ProtomuxRPCRouter();
  t.teardown(() => router.close());

  const service = new BlindPeerRouter(store, swarm, router, {
    blindPeerKeys: [bp1.publicKey],
    replicaCount: 5,
  });
  t.teardown(() => service.close());

  await service.ready();

  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xcc);
  const res = await getPeers(rpc, key);

  t.is(res.peers.length, 1, "capped to available blind peers");
});
