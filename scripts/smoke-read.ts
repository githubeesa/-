// Live, wallet-free check that every query Rakt Relay sends is accepted by the
// Tiramisu node (parse + type check on the node side). Safe to run anytime.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http, type Hex } from "viem"
import deployment from "../src/deployment.json" with { type: "json" }
import { bboxAround } from "../src/core/geo"
import {
  expiringSoonQuery, feedQuery, hospitalRequestsQuery, hospitalsQuery, pledgesQuery, receiptsQuery,
} from "../src/core/queries"

const rpc = process.env.ARKIV_RPC_URL || undefined
const client = createPublicClient({ chain: tiramisu, transport: http(rpc) })
const ZERO = "0x0000000000000000000000000000000000000001" as Hex
const stewards = (deployment.stewards as Hex[]).length ? (deployment.stewards as Hex[]) : [ZERO]
const hospitals = (deployment.hospitals as { wallet: Hex }[]).map((h) => h.wallet)
const hw = hospitals.length ? hospitals : [ZERO, "0x0000000000000000000000000000000000000002" as Hex]
const donor = ((deployment.donors as { wallet: Hex }[])[0]?.wallet ?? ZERO) as Hex
const fakeKey = ("0x" + "11".repeat(32)) as Hex

const head = await client.getBlockNumber()
console.log("chain", await client.getChainId(), "head block", head)

const checks: [string, { toString(): string; fetch(): Promise<{ entities: readonly unknown[] }> }][] = [
  ["Q1 hospitals by steward ($creator)", hospitalsQuery(client, stewards)],
  ["Q2 donor feed (compat OR + urgency + bbox + creator OR)", feedQuery(client, {
    hospitalWallets: hw, donorGroup: "O+", maxUrgency: 2, bbox: bboxAround(12.9716, 77.5946, 15), city: "bengaluru",
  })],
  ["Q3 pledges for a request (key attr)", pledgesQuery(client, fakeKey)],
  ["Q4 hospital dashboard (createdBy)", hospitalRequestsQuery(client, hw[0]!)],
  ["Q5 expiring soon ($expiresAt range)", expiringSoonQuery(client, hw[0]!, head, 5400n)],
  ["Q6 donor receipts (ownedBy)", receiptsQuery(client, donor)],
]
let failed = 0
for (const [name, q] of checks) {
  try {
    const page = await q.fetch()
    console.log(`OK   ${name}: ${page.entities.length} entities\n     ${q.toString()}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${name}: ${(e as Error).message}\n     ${q.toString()}`)
  }
}
process.exit(failed ? 1 : 0)
