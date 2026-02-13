![CI](https://github.com/holepunchto/blind-peer-router/actions/workflows/ci.yml/badge.svg)

# blind-peer-router

> **POC** — This is a proof-of-concept. Blind peers must be provided as a fixed set at startup. Dynamic peer discovery and registration are not yet implemented.

Single-writer RPC service that maps content keys to blind peer assignments. Clients request peers for a given content key and the service resolves the closest configured blind peers by XOR distance, persisting assignments in HyperDB so subsequent requests for the same key return the same peers.

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
2. A client sends a `resolve-peers` RPC request with a content key.
3. If the key already has an assignment, the stored peers are returned.
4. Otherwise the service picks the closest peers by XOR distance, stores the assignment in HyperDB, and returns the peer keys.

### Current limitations (POC)

- **Fixed peer set**: Blind peers must be passed at startup. There is no dynamic registration or discovery — the operator must manually add/remove peers by restarting the service.
- **Single writer**: Only one instance writes to the database. No multi-indexer / Autobase support yet.
- **No health checks**: The service does not verify that configured blind peers are online or healthy before assigning them.
- **No rebalancing**: If a blind peer goes down, existing assignments to it are not migrated.
- **Best-effort persistence in interval mode**: when using periodic flushes, recent assignments may be lost on unclean shutdown.

## CLI

```
blind-peer-router run [options]
```

- `--storage|-s [path]`: storage directory (default: `./blind-peer-router`)
- `--blind-peer|-b <key>`: blind peer public key in z32 or hex (repeatable, at least one required)
- `--replica-count|-r [count]`: number of peers assigned per key (default: `1`)
- `--auto-flush [enabled]`: flush on every assignment (`true`/`false`, default: `true`)

## API

#### `const service = new BlindPeerRouter(store, swarm, router, opts)`

Create a new blind peer routing service.

- `store`: Corestore instance
- `swarm`: Hyperswarm instance
- `router`: ProtomuxRPCRouter instance (with middleware already applied)
- `opts.blindPeerKeys`: array of blind peer public keys (Buffers) — the fixed set of blind peers to assign from
- `opts.replicaCount`: number of peers to assign per key (default: `1`, capped to number of blind peers)
- `opts.autoFlush`: flush each assignment when `true`; when `false`, flushes are batched by a 1s interval (default: `true`)

#### `await service.ready()`

Start the service: opens the database, starts the RPC router, and joins the swarm.

#### `await service.close()`

Gracefully shut down the service.

#### `service.publicKey`

The swarm public key clients use to connect.
