import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { webSocket } from "viem"
const c = createPublicClient({ chain: tiramisu, transport: webSocket() })
let n = 0
const t0 = Date.now()
const un = c.watchEntityEvents({ onEvent: (e) => { n++; if (n <= 3) console.log("event", e.type, e.entityKey.slice(0, 12), "block", e.blockNumber) }, onError: (e) => console.log("err", e.message) })
setTimeout(() => { un(); console.log(`received ${n} events in ${(Date.now() - t0) / 1000}s over WebSocket`); process.exit(0) }, 45000)
