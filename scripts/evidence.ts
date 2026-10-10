// Prints every live Rakt Relay entity per demo wallet, with explorer links. Judges can run this
// (no wallet needed) to verify on-chain usage. Expired entities no longer appear; their creation
// transactions remain on the explorer and are listed in src/deployment.json -> evidence.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { str } from "@arkiv-network/sdk/attr"
import { eq } from "@arkiv-network/sdk/query"
import { http, type Hex } from "viem"
import d from "../src/deployment.json" with { type: "json" }
import { attrStr, PROJECT } from "../src/core/schema"

const pub = createPublicClient({ chain: tiramisu, transport: http(process.env.ARKIV_RPC_URL || undefined) })
const X = "https://tiramisu.explorer.arkiv.network"
const dep = d as unknown as { stewards: Hex[]; hospitals: { name: string; wallet: Hex }[]; donors: { wallet: Hex }[]; imposters?: { wallet: Hex }[] }
const wallets: [string, Hex][] = [
  ...dep.stewards.map((w) => ["steward", w] as [string, Hex]),
  ...dep.hospitals.map((h) => [`hospital: ${h.name}`, h.wallet] as [string, Hex]),
  ...dep.donors.map((x) => ["donor", x.wallet] as [string, Hex]),
  ...(dep.imposters ?? []).map((x) => ["imposter (rejected by app)", x.wallet] as [string, Hex]),
]
if (!wallets.length) { console.log("No wallets in src/deployment.json yet. Run `npm run seed`."); process.exit(0) }
const head = await pub.getBlockNumber()
for (const [role, w] of wallets) {
  console.log(`\n${role}  ${X}/address/${w}`)
  for await (const e of pub.select({ key: true, attributes: true, expiresAt: true, owner: true })
    .where(eq("project", str(PROJECT))).createdBy(w)) {
    const left = Number(e.expiresAt - head) * 2
    console.log(`  ${attrStr(e.attributes, "type")?.padEnd(17)} ${X}/entity/${e.key}  owner ${e.owner.slice(0, 8)}…  expires in ${(left / 3600).toFixed(1)}h`)
  }
}
