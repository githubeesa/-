// Executes every Rakt Relay write against LIVE Tiramisu state as an eth_call simulation, with an
// unfunded throwaway wallet. Nothing is broadcast and nothing is spent.
//
// How: a transport wrapper intercepts the SDK's eth_estimateGas, replays the exact same tx as an
// eth_call (no gas price => no balance check), records whether the Arkiv precompile accepted or
// reverted it, then aborts the send. This exercises node-side validation of attributes, expiry,
// flags, salts, batch ordering and ownership rules, not just client-side encoding.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, decodeErrorResult, http, parseAbi, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { hospitalEntity, pledgeEntity, receiptEntity, requestEntity, URGENCY } from "../src/core/schema"
import { i32, str } from "@arkiv-network/sdk/attr"

// Copied from the SDK's internal ENTITY_ERRORS_ABI (src/utils/arkivTransactions.ts, 0.8.1), which the
// package does not export. See /arkiv/friction.md.
const ENTITY_ERRORS = parseAbi([
  "error EmptyBatch()",
  "error InvalidOpType(uint8 operation)",
  "error NonCanonicalOperationData(uint8 operation)",
  "error AttributesNotSorted()",
  "error TooManyAttributes(uint256 count, uint256 maxCount)",
  "error EmptyMutations(bytes32 entityKey)",
  "error TombstoneInCreate(bytes32 name)",
  "error TombstoneValueNotEmpty(bytes32 name)",
  "error SystemAttributeNotWritable(bytes32 name)",
  "error InvalidValueType(bytes32 name, uint8 typeId)",
  "error Ident32Empty()",
  "error Ident32InvalidByte(uint256 position, bytes1 value)",
  "error EntityNotFound(bytes32 entityKey)",
  "error EntityExpired(bytes32 entityKey, uint64 expiresAt)",
  "error NotOwner(bytes32 entityKey, address caller, address owner)",
  "error ReadOnlyEntity(bytes32 entityKey)",
  "error ReservedCreationFlags(uint8 creationFlags)",
  "error ExpiryDeadOnArrival(uint64 target, uint64 currentBlock)",
  "error ExpiryNotExtended(bytes32 entityKey, uint64 newExpiresAt, uint64 currentExpiresAt)",
  "error TransferToZeroAddress(bytes32 entityKey)",
  "error TransferToSelf(bytes32 entityKey)",
])
const base = http(process.env.ARKIV_RPC_URL || undefined)({ chain: tiramisu })
const sim: { last?: { ok: boolean; detail: string } } = {}
const transport = custom({
  async request({ method, params }: { method: string; params?: unknown[] }) {
    if (method === "eth_estimateGas") {
      const tx = { ...(params![0] as Record<string, unknown>) }
      delete tx.gasPrice; delete tx.maxFeePerGas; delete tx.maxPriorityFeePerGas
      tx.gas = "0x1c9c380"
      try {
        const out = await base.request({ method: "eth_call", params: [tx, "latest"] })
        sim.last = { ok: true, detail: `eth_call ok (${String(out).slice(0, 18)}…)` }
      } catch (e) {
        const c = e as { details?: string; shortMessage?: string; data?: unknown }
        const raw = String(c.details ?? "").match(/0x[0-9a-fA-F]{8,}/)?.[0] ?? (typeof c.data === "string" ? c.data : undefined)
        let decoded = ""
        try { if (raw) { const r = decodeErrorResult({ abi: ENTITY_ERRORS, data: raw as Hex }); decoded = `${r.errorName}(${(r.args ?? []).join(",").slice(0, 20)}…)` } } catch { /* unknown selector */ }
        sim.last = { ok: false, detail: `reverted ${decoded || (c.shortMessage ?? "") + " " + (c.details ?? "")}`.trim() }
      }
      throw new Error("SIMULATION_ONLY")
    }
    return base.request({ method, params } as never)
  },
})
const pub = createPublicClient({ chain: tiramisu, transport: http(process.env.ARKIV_RPC_URL || undefined) })
const account = privateKeyToAccount(generatePrivateKey())
const w = createWalletClient({ chain: tiramisu, transport, account })
const fakeKey = ("0x" + "22".repeat(32)) as Hex

const ops: [string, boolean, () => Promise<unknown>][] = [
  ["create hospital (readonly)", true, () => w.createEntity(hospitalEntity({
    hospitalWallet: account.address, name: "Demo General Hospital (synthetic)", city: "bengaluru", state: "KA",
    lat: 12.9716, lng: 77.5946, address: "1 Demo Road", bloodCentreDesk: "Gate 3", licenceRef: "SYN-0001" }))],
  ["create blood_request (atDate+atLeast)", true, () => w.createEntity(requestEntity({
    hospitalKey: fakeKey, hospitalName: "Demo", bloodGroup: "O-", component: "prbc", units: 2, urgency: URGENCY.critical,
    city: "bengaluru", lat: 12.97, lng: 77.59, neededBy: new Date(Date.now() + 6 * 3600_000), ref: "RR-TEST" }))],
  ["create pledge (6h)", true, () => w.createEntity(pledgeEntity({ requestKey: fakeKey, bloodGroup: "O-", etaMinutes: 40 }))],
  ["batch: create request + create receipt(predicted salt) + changeOwnership(receipt)", true, async () => {
    const [r, rc] = await pub.predictEntityKeys({ owner: account.address, count: 2 })
    return w.executeBatch({
      creates: [
        { ...requestEntity({ hospitalKey: fakeKey, hospitalName: "Demo", bloodGroup: "B+", component: "whole", units: 1,
          urgency: URGENCY.urgent, city: "bengaluru", lat: 12.9, lng: 77.6, neededBy: new Date(Date.now() + 3 * 3600_000), ref: "RR-B" }), salt: r.salt },
        receiptEntity({ requestKey: r.key, hospitalKey: fakeKey, hospitalName: "Demo", bloodGroup: "B+", component: "whole", ref: "RR-B" }, rc.salt),
      ],
      patches: [{ entityKey: r.key, set: { units_received: i32(1), status: str("fulfilled") } }],
      ownershipChanges: [{ entityKey: rc.key, newOwner: "0x000000000000000000000000000000000000dEaD" }],
    })
  }],
  ["NEGATIVE: patching a readonly receipt must revert", false, async () => {
    const [rc] = await pub.predictEntityKeys({ owner: account.address, count: 1 })
    return w.executeBatch({
      creates: [receiptEntity({ requestKey: fakeKey, hospitalKey: fakeKey, hospitalName: "Demo", bloodGroup: "O+", component: "whole", ref: "X" }, rc.salt)],
      patches: [{ entityKey: rc.key, set: { ref: str("tampered") } }],
    })
  }],
  ["NEGATIVE: patch someone else's / missing entity must revert", false, () =>
    w.patchEntity({ entityKey: fakeKey, set: { status: str("fulfilled") } })],
]
let bad = 0
for (const [name, expectOk, op] of ops) {
  sim.last = undefined
  try { await op() } catch { /* expected: SIMULATION_ONLY */ }
  const last = sim.last as { ok: boolean; detail: string } | undefined
  const pass = last !== undefined && last.ok === expectOk
  if (!pass) bad++
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${last ? last.detail : "never reached the node (client-side validation error)"}`)
}
process.exit(bad ? 1 : 0)
