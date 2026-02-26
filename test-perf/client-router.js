/*
Prepare sample blind peers config.json with:
{
  "blindPeers": {
    "blind-peer-key1": {},
    "blind-peer-key2": {},
  }
}

Then run the blind-peer-router service with:
  ./bin.js run -c ./config.json -s ./storage

Then run this client with:
  node client-router.js <server-public-key>
*/

const crypto = require('hypercore-crypto')
const IdEnc = require('hypercore-id-encoding')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')

const { resolveStruct } = require('../spec/hyperschema')
const ResolvePeersRequest = resolveStruct('@blind-peer-router/resolve-peers-request')
const ResolvePeersResponse = resolveStruct('@blind-peer-router/resolve-peers-response')

const serverPublicKey = process.argv[2]
const COUNT_RUNS = 100000

async function main() {
  const dht = new HyperDHT()
  const client = new ProtomuxRpcClient(dht)

  console.time('main')

  for (let i = 0; i < COUNT_RUNS; i++) {
    const coreKey = crypto.randomBytes(32)
    const res = await client.makeRequest(
      IdEnc.decode(serverPublicKey),
      'resolve-peers',
      { key: coreKey },
      {
        requestEncoding: ResolvePeersRequest,
        responseEncoding: ResolvePeersResponse
      }
    )
    if (i % 1000 === 0) {
      console.log(i, res.peers.length ? 'OK' : 'ERR')
    }
  }

  console.timeEnd('main')
}

main()
