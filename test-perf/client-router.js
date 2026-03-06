/*
Prepare sample blind peers config.json with:
{
  "blindPeers": {
    "blind-peer-key1": {},
    "blind-peer-key2": {},
  }
}

Comment out the defaultMiddleware in bin.js or increase the rateLimit option
  // router.use(defaultMiddleware({ logger: { instance: logger } }))

Then run the blind-peer-router service with:
  ./bin.js run -c ./config.json -s ./storage

Then run this client with:
  node client-router.js <server-public-key>
*/

const crypto = require('hypercore-crypto')
const IdEnc = require('hypercore-id-encoding')
const HyperDHT = require('hyperdht')
const ProtomuxRpcClient = require('protomux-rpc-client')
const { RouterResolvePeersRequest, RouterResolvePeersResponse } = require('blind-peer-encodings')

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
        requestEncoding: RouterResolvePeersRequest,
        responseEncoding: RouterResolvePeersResponse
      }
    )
    if (i % 1000 === 0) {
      console.log(i, res.peers.length ? 'OK' : 'ERR')
    }
  }

  console.timeEnd('main')

  await client.close()
  await dht.destroy()
}

main()
