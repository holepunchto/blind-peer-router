# blind-peer-router

> **POC** — This is a proof-of-concept. Blind peers must be provided as a fixed set at startup. Dynamic peer discovery and registration are not yet implemented.

Single-writer RPC service that maps content keys to blind peer assignments. Clients request peers for a given content key and the service assigns blind peers from the configured set using round-robin, persisting assignments in a HyperDB so subsequent requests for the same key return the same peers.

## Install

```
npm install blind-peer-router
```

## Usage

```
blind-peer-router run --blind-peer <key1> --blind-peer <key2>
```

The set of blind peers is fixed at startup via CLI flags. You must know the public keys of your blind peer instances ahead of time and pass them in.

## How it works

1. The operator starts the service with a list of known blind peer public keys.
2. A client sends a `get-peers` RPC request with a content key.
3. If the key already has an assignment, the stored peers are returned.
4. Otherwise the service picks peers via round-robin, delegates the core to them via `blind-peering`, stores the assignment in HyperDB, and returns the peers.

### Current limitations (POC)

- **Fixed peer set**: Blind peers must be passed at startup. There is no dynamic registration or discovery — the operator must manually add/remove peers by restarting the service.
- **Single writer**: Only one instance writes to the database. No multi-indexer / Autobase support yet.
- **No health checks**: The service does not verify that configured blind peers are online or healthy before assigning them.
- **No rebalancing**: If a blind peer goes down, existing assignments to it are not migrated.

## CLI

```
blind-peer-router run [options]
```

- `--storage|-s [path]`: storage directory (default: `./blind-peer-router`)
- `--blind-peer|-b <key>`: blind peer public key in z32 or hex (repeatable, at least one required)
- `--replica-count|-r [count]`: number of peers assigned per key (default: `1`)

## API

#### `const service = new BlindPeerRouter(store, swarm, router, opts)`

Create a new blind peer routing service.

- `store`: Corestore instance
- `swarm`: Hyperswarm instance
- `router`: ProtomuxRPCRouter instance (with middleware already applied)
- `opts.blindPeerKeys`: array of blind peer public keys (Buffers) — the fixed set of blind peers to assign from
- `opts.replicaCount`: number of peers to assign per key (default: `1`, capped to number of blind peers)

#### `await service.ready()`

Start the service: opens the database, starts the RPC router, and joins the swarm.

#### `await service.close()`

Gracefully shut down the service.

#### `service.publicKey`

The swarm public key clients use to connect.
