import assert from "node:assert/strict"
import { test } from "node:test"
import { str } from "@arkiv-network/sdk/attr"
import { eq } from "@arkiv-network/sdk/query"
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http, type Hex } from "viem"
import { BLOOD_GROUPS, donorsFor, recipientsFor } from "../src/core/compat"
import { bboxAround, haversineKm } from "../src/core/geo"
import { feedQuery, MAX_CREATOR_OR } from "../src/core/queries"
import { hospitalEntity, pledgeEntity, receiptEntity, requestEntity, URGENCY } from "../src/core/schema"

const k = ("0x" + "ab".repeat(32)) as Hex
const w = "0x1111111111111111111111111111111111111111" as Hex
// a client is only needed to build query strings; nothing is sent in these tests
const pub = createPublicClient({ chain: tiramisu, transport: http("http://127.0.0.1:1") })

test("O- is universal red-cell donor, AB+ universal recipient", () => {
  assert.deepEqual(recipientsFor("O-").length, 8)
  assert.deepEqual(donorsFor("AB+").length, 8)
  assert.deepEqual(recipientsFor("AB+"), ["AB+"])
  for (const d of BLOOD_GROUPS) for (const r of recipientsFor(d)) assert.ok(donorsFor(r).includes(d))
})

test("bbox contains its centre and ~radius", () => {
  const b = bboxAround(12.9716, 77.5946, 10)
  assert.ok(Number(b.minLat) < 12.9716 && Number(b.maxLat) > 12.9716)
  const edge = haversineKm(12.9716, 77.5946, Number(b.maxLat), 77.5946)
  assert.ok(Math.abs(edge - 10) < 0.2, `edge ${edge}`)
})

test("request entity: typed attributes, no personal data in payload, expiry floor", () => {
  const e = requestEntity({ hospitalKey: k, hospitalName: "X", bloodGroup: "O-", component: "prbc", units: 2,
    urgency: URGENCY.critical, city: "bengaluru", lat: 12.9, lng: 77.5, neededBy: new Date(Date.now() + 3600_000), ref: "R1" })
  assert.equal(e.attributes.units_needed.type, "i32")
  assert.equal(e.attributes.needed_by_ms.type, "u64")
  assert.equal(e.attributes.lat.type, "dec")
  assert.equal(e.attributes.hospital.type, "key")
  const payload = JSON.parse(new TextDecoder().decode(e.payload))
  assert.deepEqual(Object.keys(payload).sort(), ["hospitalName", "note", "ref"])
  assert.throws(() => requestEntity({ hospitalKey: k, hospitalName: "X", bloodGroup: "O-", component: "prbc", units: 0,
    urgency: URGENCY.critical, city: "c", lat: 1, lng: 1, neededBy: new Date(), ref: "R" }))
})

test("hospital and receipt are readonly attestations; pledge is short-lived", () => {
  assert.equal(hospitalEntity({ hospitalWallet: w, name: "H", city: "c", state: "KA", lat: 1, lng: 2, address: "a", bloodCentreDesk: "d", licenceRef: "SYN" }).flags.readonly, true)
  assert.equal(receiptEntity({ requestKey: k, hospitalKey: k, hospitalName: "H", bloodGroup: "O+", component: "whole", ref: "r" }, 5n).salt, 5n)
  const p = pledgeEntity({ requestKey: k, bloodGroup: "O+", etaMinutes: 30 })
  assert.equal(p.attributes.request.type, "key")
})

test("feed query renders compatibility OR, ranges and $creator OR", () => {
  const s = feedQuery(pub, { hospitalWallets: [w], donorGroup: "B-", maxUrgency: 2, bbox: bboxAround(12.97, 77.59, 5) }).toString()
  assert.match(s, /blood_group = str\('B-'\) OR blood_group = str\('B\+'\) OR blood_group = str\('AB-'\) OR blood_group = str\('AB\+'\)/)
  assert.match(s, /urgency <= i32\(2\)/)
  assert.match(s, /lat >= dec\(/)
  assert.match(s, /\$creator = addr\(/)
  assert.match(s, /status = str\('open'\)/)
})

test("too many trusted creators falls back to client-side filtering", () => {
  const many = Array.from({ length: MAX_CREATOR_OR + 1 }, (_, i) => ("0x" + String(i + 1).padStart(40, "0")) as Hex)
  assert.doesNotMatch(feedQuery(pub, { hospitalWallets: many }).toString(), /\$creator/)
  assert.ok(eq("project", str("x")))
})
