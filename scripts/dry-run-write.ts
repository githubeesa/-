// Proves every write is well-formed WITHOUT spending anything: signs each operation with a
// brand-new, unfunded throwaway key. The SDK validates attributes/expiry locally, the node then
// estimates gas and must reject ONLY for lack of funds. Any other error is a real bug.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { hospitalEntity, pledgeEntity, receiptEntity, requestEntity, URGENCY } from "../src/core/schema"

const transport = http(process.env.ARKIV_RPC_URL || undefined)
const pub = createPublicClient({ chain: tiramisu, transport })
const account = privateKeyToAccount(generatePrivateKey())
const w = createWalletClient({ chain: tiramisu, transport, account })
const k = ("0x" + "22".repeat(32)) as Hex

const ops: [string, () => Promise<unknown>][] = [
  ["create hospital (readonly flag)", () => w.createEntity(hospitalEntity({
    hospitalWallet: account.address, name: "Demo General Hospital (synthetic)", city: "bengaluru", state: "KA",
    lat: 12.9716, lng: 77.5946, address: "1 Demo Road", bloodCentreDesk: "Gate 3", licenceRef: "SYN-0001" }))],
  ["create blood_request (atDate + atLeast expiry)", () => w.createEntity(requestEntity({
    hospitalKey: k, hospitalName: "Demo", bloodGroup: "O-", component: "prbc", units: 2, urgency: URGENCY.critical,
    city: "bengaluru", lat: 12.97, lng: 77.59, neededBy: new Date(Date.now() + 6 * 3600_000), ref: "RR-TEST" }))],
  ["create pledge", () => w.createEntity(pledgeEntity({ requestKey: k, bloodGroup: "O-", etaMinutes: 40 }))],
  ["batch: receipt(predicted salt) + patch + changeOwnership", async () => {
    const [p] = await pub.predictEntityKeys({ owner: account.address, count: 1 })
    return w.executeBatch({
      creates: [receiptEntity({ requestKey: k, hospitalKey: k, hospitalName: "Demo", bloodGroup: "O-", component: "prbc", ref: "RR-TEST" }, p.salt)],
      patches: [{ entityKey: k, set: {} as never }].slice(0, 0),
      ownershipChanges: [{ entityKey: p.key, newOwner: "0x000000000000000000000000000000000000dEaD" }],
    })
  }],
]
let bad = 0
for (const [name, op] of ops) {
  try {
    await op()
    console.log(`?? ${name}: unexpectedly succeeded`)
  } catch (e) {
    // The SDK wraps the node's answer; walk the cause chain to read what the node actually said.
    const parts: string[] = []
    let cur: unknown = e
    while (cur && parts.length < 8) {
      const c = cur as { shortMessage?: string; details?: string; message?: string; cause?: unknown }
      parts.push([c.shortMessage, c.details].filter(Boolean).join(" / ") || (c.message ?? "").split("\n")[0])
      cur = c.cause
    }
    const msg = parts.join(" <- ")
    const funds = /insufficient funds|exceeds the balance|gas required exceeds/i.test(msg)
    if (!funds) bad++
    console.log(`${funds ? "OK (rejected only for funds)" : "FAIL"} ${name}: ${msg.slice(0, 400)}`)
  }
}
process.exit(bad ? 1 : 0)
