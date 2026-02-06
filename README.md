# blind-peer-router

Single-writer RPC service that maps content keys to blind peer assignments via round-robin.

## Install

```
npm install blind-peer-router
```

## Usage

```
blind-peer-router run --blind-peer <key1> --blind-peer <key2>
```

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
- `opts.blindPeerKeys`: array of blind peer public keys (Buffers)
- `opts.replicaCount`: number of peers to assign per key (default: `1`, capped to number of blind peers)

#### `await service.ready()`

Start the service: opens the database, starts the RPC router, and joins the swarm.

#### `await service.close()`

Gracefully shut down the service.

#### `service.publicKey`

The swarm public key clients use to connect.
