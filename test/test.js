const test = require("brittle");
const createTestnet = require("hyperdht/testnet");
const HyperDHT = require("hyperdht");
const Corestore = require("corestore");
const Hyperswarm = require("hyperswarm");
const ProtomuxRPC = require("protomux-rpc");
const ProtomuxRPCRouter = require("protomux-rpc-router");
const tmpDir = require("test-tmp");
const b4a = require("b4a");
const IdEnc = require("hypercore-id-encoding");

const BlindPeerRouter = require("..");
const { resolveStruct } = require("../spec/hyperschema");
const ResolvePeersRequest = resolveStruct(
  "@blind-peer-router/resolve-peers-request",
);
const ResolvePeersResponse = resolveStruct(
  "@blind-peer-router/resolve-peers-response",
);

async function setupTestnet(t) {
  const testnet = await createTestnet();
  t.teardown(() => testnet.destroy());
  return testnet;
}

async function setupRoutingService(
  t,
  bootstrap,
  blindPeerKeys,
  { replicaCount = 2 } = {},
) {
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
    replicaCount,
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

function createBlindPeerKeys(count) {
  return Array.from({ length: count }, (_, i) => b4a.alloc(32, i + 1));
}

function sortPeerKeys(peers) {
  return peers.map((p) => IdEnc.encode(p)).sort();
}

async function resolvePeers(rpc, key) {
  return rpc.request(
    "resolve-peers",
    { key },
    {
      requestEncoding: ResolvePeersRequest,
      responseEncoding: ResolvePeersResponse,
    },
  );
}

test("resolve-peers assigns blind peers for a new key", async (t) => {
  const { bootstrap } = await setupTestnet(t);
  const blindPeerKeys = createBlindPeerKeys(5);

  const service = await setupRoutingService(t, bootstrap, blindPeerKeys);
  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xaa);
  const res = await resolvePeers(rpc, key);

  t.is(res.peers.length, 2, "assigns replicaCount peers");
  t.ok(
    res.peers.every((p) =>
      blindPeerKeys.some((peerKey) => b4a.equals(p, peerKey)),
    ),
    "assigned peers are from the configured blind peer list",
  );
});

test("resolve-peers returns same peers on second call", async (t) => {
  const { bootstrap } = await setupTestnet(t);
  const blindPeerKeys = createBlindPeerKeys(5);

  const service = await setupRoutingService(t, bootstrap, blindPeerKeys);
  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xbb);
  const res1 = await resolvePeers(rpc, key);
  const res2 = await resolvePeers(rpc, key);

  t.alike(
    sortPeerKeys(res1.peers),
    sortPeerKeys(res2.peers),
    "same peers returned for same key",
  );
});

test("replicaCount is capped to number of blind peers", async (t) => {
  const { bootstrap } = await setupTestnet(t);
  const blindPeerKeys = [b4a.alloc(32, 0xab)];

  const service = await setupRoutingService(t, bootstrap, blindPeerKeys, {
    replicaCount: 5,
  });
  const rpc = await setupClient(t, bootstrap, service.publicKey);

  const key = b4a.alloc(32, 0xcc);
  const res = await resolvePeers(rpc, key);

  t.is(res.peers.length, 1, "capped to available blind peers");
});
