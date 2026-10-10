// Seeds a realistic, 100% SYNTHETIC demo on Tiramisu and records the public evidence
// (wallet addresses, entity keys, tx hashes) in src/deployment.json for the app and the judges.
//
//   1. steward shares test GLM with the other demo wallets
//   2. steward attests two synthetic blood centres in ONE atomic batch (readonly entities)
//   3. each hospital publishes its open requests in one batch (expiry = clinical "needed by")
//   4. an IMPOSTER wallet publishes a look-alike request (same attributes!) that the app must reject
//   5. the donor pledges to two requests (6h pledges)
//   6. hospital 1 confirms the donor's donation: receipt + counter + ownership transfer, one batch
//   7. hospital 2 renews a still-needed request (Lifetime Extension) and closes another
import "dotenv/config"
import { writeFileSync } from "node:fs"
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { createWalletClient as viemWallet, http, parseEther, formatEther, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import * as A from "../src/core/actions"
import { type RequestInput, requestEntity, URGENCY } from "../src/core/schema"

const transport = http(process.env.ARKIV_RPC_URL || undefined)
const pub = createPublicClient({ chain: tiramisu, transport })
const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`${k} missing in .env. Run \`npm run wallets\` first.`)
  return privateKeyToAccount(v as Hex)
}
const acct = {
  steward: need("STEWARD_KEY"), h1: need("HOSPITAL_1_KEY"), h2: need("HOSPITAL_2_KEY"),
  donor: need("DONOR_KEY"), imposter: need("IMPOSTER_KEY"),
}
const W = (a: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ chain: tiramisu, transport, account: a })
const evidence: { step: string; tx?: string; keys?: string[] }[] = []
const log = (step: string, r: { txHash?: Hex; createdEntities?: Hex[]; entityKey?: Hex }) => {
  const keys = r.createdEntities ?? (r.entityKey ? [r.entityKey] : [])
  evidence.push({ step, tx: r.txHash, keys })
  console.log(`✔ ${step}  tx ${r.txHash ?? "?"}${keys.length ? `  entities ${keys.join(", ")}` : ""}`)
}
const hours = (h: number) => new Date(Date.now() + h * 3600_000)

// 1. share GLM
const bal = await pub.getBalance({ address: acct.steward.address })
console.log(`steward ${acct.steward.address} balance ${formatEther(bal)} GLM`)
if (bal === 0n) throw new Error("Steward has 0 GLM. Claim test GLM for it at https://hub.arkiv.network/faucet")
const share = bal / 8n
const vw = viemWallet({ chain: tiramisu, transport, account: acct.steward })
for (const [name, a] of [["h1", acct.h1], ["h2", acct.h2], ["donor", acct.donor], ["imposter", acct.imposter]] as const) {
  const have = await pub.getBalance({ address: a.address })
  if (have >= share / 2n) continue
  const hash = await vw.sendTransaction({ to: a.address, value: share })
  await pub.waitForTransactionReceipt({ hash })
  console.log(`✔ funded ${name} ${a.address} with ${formatEther(share)} GLM (tx ${hash})`)
}

// 2. steward attests two synthetic blood centres, atomically
const H1 = { hospitalWallet: acct.h1.address, name: "Sanjeevani Demo Hospital (synthetic)", city: "bengaluru", state: "KA",
  lat: 12.925, lng: 77.5938, address: "Demo Road, Jayanagar, Bengaluru (synthetic)",
  bloodCentreDesk: "Blood Centre counter, Ground floor, Gate 2", licenceRef: "SYN-KA-0001" }
const H2 = { hospitalWallet: acct.h2.address, name: "Namma Demo Medical College (synthetic)", city: "bengaluru", state: "KA",
  lat: 13.0358, lng: 77.597, address: "Demo Main Road, Hebbal, Bengaluru (synthetic)",
  bloodCentreDesk: "Department of Transfusion Medicine, Block B", licenceRef: "SYN-KA-0002" }
const att = await A.verifyHospitals(W(acct.steward), [H1, H2])
log("steward attests 2 blood centres (batch, readonly)", att)
const [h1Key, h2Key] = att.createdEntities as [Hex, Hex]

// 3. hospitals publish requests (one batch each)
const base = (h: typeof H1, key: Hex) => ({ hospitalKey: key, hospitalName: h.name, city: h.city, lat: h.lat, lng: h.lng })
const h1Reqs: RequestInput[] = [
  { ...base(H1, h1Key), bloodGroup: "O-", component: "prbc", units: 2, urgency: URGENCY.critical, neededBy: hours(5), ref: "RR-1041", note: "Trauma case. Any photo ID." },
  { ...base(H1, h1Key), bloodGroup: "A+", component: "platelets", units: 4, urgency: URGENCY.urgent, neededBy: hours(24), ref: "RR-1042", note: "Dengue ward. Apheresis donors preferred." },
  { ...base(H1, h1Key), bloodGroup: "B+", component: "whole", units: 1, urgency: URGENCY.planned, neededBy: hours(72), ref: "RR-1043", note: "Planned surgery." },
]
const h2Reqs: RequestInput[] = [
  { ...base(H2, h2Key), bloodGroup: "O+", component: "prbc", units: 3, urgency: URGENCY.critical, neededBy: hours(6), ref: "NM-2201", note: "Post-partum haemorrhage." },
  { ...base(H2, h2Key), bloodGroup: "AB-", component: "plasma", units: 2, urgency: URGENCY.urgent, neededBy: hours(12), ref: "NM-2202" },
  { ...base(H2, h2Key), bloodGroup: "B-", component: "prbc", units: 1, urgency: URGENCY.urgent, neededBy: new Date(Date.now() + 15 * 60_000), ref: "NM-2203", note: "Short-lived demo request: watch it disappear." },
  { ...base(H2, h2Key), bloodGroup: "A-", component: "prbc", units: 1, urgency: URGENCY.planned, neededBy: hours(48), ref: "NM-2204", note: "Thalassaemia day-care." },
]
const r1 = await W(acct.h1).executeBatch({ creates: h1Reqs.map(requestEntity) })
log("hospital 1 publishes 3 requests (batch)", r1)
const r2 = await W(acct.h2).executeBatch({ creates: h2Reqs.map(requestEntity) })
log("hospital 2 publishes 4 requests (batch)", r2)
const [oNeg] = r1.createdEntities as Hex[]
const [oPos, abNeg, , aNeg] = r2.createdEntities as Hex[]

// 4. an imposter copies the exact attribute shape. Only $creator gives it away.
const fake = await A.postRequest(W(acct.imposter), {
  ...base(H1, h1Key), bloodGroup: "O-", component: "prbc", units: 3, urgency: URGENCY.critical, neededBy: hours(24),
  ref: "RR-9999", note: "URGENT!! Send Rs 500 donor travel money by UPI first (SCAM EXAMPLE, synthetic)" })
log("IMPOSTER posts a look-alike request (must be rejected by the app)", fake)

// 5. donor pledges
log("donor pledges to O- request", await A.pledge(W(acct.donor), { requestKey: oNeg!, bloodGroup: "O-", etaMinutes: 40 }))
log("donor pledges to O+ request", await A.pledge(W(acct.donor), { requestKey: oPos!, bloodGroup: "O-", etaMinutes: 90 }))

// 6. hospital 1 confirms the donation atomically
const conf = await A.confirmDonation(W(acct.h1), pub, {
  requestKey: oNeg!, hospitalKey: h1Key, hospitalName: H1.name, bloodGroup: "O-", component: "prbc", ref: "RR-1041",
  donor: acct.donor.address, unitsReceivedSoFar: 0, unitsNeeded: 2 })
log("hospital 1 confirms donation: receipt + units_received + transfer to donor (batch)", conf)

// 7. hospital 2: still needed -> Lifetime Extension; another one fulfilled
log("hospital 2 renews A- request to 72h from now (Lifetime Extension)", await A.extendRequest(W(acct.h2), aNeg!, 72))
log("hospital 2 marks AB- plasma request fulfilled (patch)", await A.closeRequest(W(acct.h2), abNeg!, "fulfilled"))

writeFileSync("src/deployment.json", JSON.stringify({
  note: "Public evidence written by `npm run seed`. Addresses and keys only, never private keys. All data synthetic.",
  network: { name: "Tiramisu", chainId: 7738577, explorer: "https://tiramisu.explorer.arkiv.network" },
  stewards: [acct.steward.address],
  hospitals: [
    { name: H1.name, wallet: acct.h1.address, attestation: h1Key },
    { name: H2.name, wallet: acct.h2.address, attestation: h2Key },
  ],
  donors: [{ role: "demo donor", wallet: acct.donor.address }],
  imposters: [{ role: "scam look-alike, must NOT appear in the app", wallet: acct.imposter.address, fakeRequest: fake.entityKey }],
  demoLinks: { oNegRequest: oNeg, fakeRequest: fake.entityKey, receipt: conf.receiptKey },
  evidence,
  seededAt: new Date().toISOString(),
}, null, 2) + "\n")
console.log("\nWrote src/deployment.json. Rebuild/redeploy the site so it trusts this steward.")
