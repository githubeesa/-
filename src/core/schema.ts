// Single source of truth for Rakt Relay's Arkiv entities.
// Every create in the app and in the seed script goes through these builders,
// so /arkiv/schema.md, the UI and the scripts cannot drift apart.

import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
import { addr, bool, dec, i32, key, str, u64 } from "@arkiv-network/sdk/attr"
import type { Hex } from "viem"
import type { BloodGroup, Component } from "./compat"
import { MIN_DONATION_INTERVAL_DAYS } from "./compat"
import { fix6 } from "./geo"

/** Project attribute: every entity carries it and every query filters on it. */
export const PROJECT = "rakt-relay"
export const SCHEMA_VERSION = 1

export const TYPES = {
  hospital: "hospital",
  request: "blood_request",
  pledge: "pledge",
  receipt: "donation_receipt",
} as const

export const URGENCY = { critical: 1, urgent: 2, planned: 3 } as const
export type Urgency = (typeof URGENCY)[keyof typeof URGENCY]

export const STATUS = { open: "open", fulfilled: "fulfilled", cancelled: "cancelled" } as const
export type Status = (typeof STATUS)[keyof typeof STATUS]

/** Entity Expiration per type, chosen from product logic (see /arkiv/schema.md). */
export const LIFETIMES = {
  /** A steward's verification of a hospital blood centre is re-checked yearly. */
  hospitalDays: 365,
  /** A request lives until the clinical "needed by" time, but never less than this. */
  requestMinMinutes: 30,
  /** A donor's pledge ("I'm coming") means nothing after a few hours. */
  pledgeHours: 6,
  /** A donation receipt is the donor's record for the year. */
  receiptDays: 365,
  /** Default Lifetime Extension when a hospital says "still needed". */
  extendHours: 12,
} as const

const common = (type: string) => ({
  project: str(PROJECT),
  type: str(type),
  schema_v: i32(SCHEMA_VERSION),
})

// ---------- hospital (created by a steward wallet) ----------

export type HospitalInput = {
  hospitalWallet: Hex
  name: string
  city: string // lowercase slug, e.g. "bengaluru"
  state: string // ISO 3166-2:IN code, e.g. "KA"
  lat: number
  lng: number
  address: string // institutional address, never a person's
  bloodCentreDesk: string // where a donor should walk to, e.g. "Blood Centre, Gate 3, Ground floor"
  licenceRef: string // SYNTHETIC in this hackathon build
}

export function hospitalEntity(h: HospitalInput) {
  return {
    payload: jsonToPayload({
      name: h.name,
      address: h.address,
      bloodCentreDesk: h.bloodCentreDesk,
      licenceRef: h.licenceRef,
      synthetic: true,
    }),
    contentType: "application/json" as const,
    attributes: {
      ...common(TYPES.hospital),
      hospital_wallet: addr(h.hospitalWallet),
      city: str(h.city),
      state: str(h.state),
      lat: dec(fix6(h.lat)),
      lng: dec(fix6(h.lng)),
      has_blood_centre: bool(true),
    },
    expires: ExpirationTime.fromDays(LIFETIMES.hospitalDays),
    // readonly: a verification is an attestation. To change it, the steward deletes it
    // and issues a new one, so the history is visible on chain.
    flags: { readonly: true },
  }
}

// ---------- blood_request (created by a verified hospital wallet) ----------

export type RequestInput = {
  hospitalKey: Hex
  hospitalName: string
  bloodGroup: BloodGroup
  component: Component
  units: number
  urgency: Urgency
  city: string
  lat: number
  lng: number
  neededBy: Date
  ref: string // the slip number the donor quotes at the counter (synthetic here)
  note?: string
}

export function requestEntity(r: RequestInput) {
  if (!Number.isInteger(r.units) || r.units < 1 || r.units > 20) throw new Error("units must be 1..20")
  return {
    payload: jsonToPayload({
      ref: r.ref,
      hospitalName: r.hospitalName,
      note: r.note ?? "",
      // Deliberately NO patient name, phone number, diagnosis or bed number.
    }),
    contentType: "application/json" as const,
    attributes: {
      ...common(TYPES.request),
      hospital: key(r.hospitalKey),
      blood_group: str(r.bloodGroup),
      component: str(r.component),
      units_needed: i32(r.units),
      units_received: i32(0),
      urgency: i32(r.urgency),
      status: str(STATUS.open),
      city: str(r.city),
      lat: dec(fix6(r.lat)),
      lng: dec(fix6(r.lng)),
      needed_by_ms: u64(BigInt(r.neededBy.getTime())),
      ref: str(r.ref),
    },
    // The request dies when the need dies: an exact deadline at the clinical "needed by"
    // time, with a floor so a request posted at the last minute is not dead on arrival.
    expires: ExpirationTime.atDate(r.neededBy, {
      atLeast: ExpirationTime.fromMinutes(LIFETIMES.requestMinMinutes),
    }),
  }
}

// ---------- pledge (created by any donor wallet) ----------

export type PledgeInput = { requestKey: Hex; bloodGroup: BloodGroup; etaMinutes: number }

export function pledgeEntity(p: PledgeInput) {
  const eta = Date.now() + p.etaMinutes * 60_000
  return {
    payload: jsonToPayload({ etaMinutes: p.etaMinutes }),
    contentType: "application/json" as const,
    attributes: {
      ...common(TYPES.pledge),
      request: key(p.requestKey),
      blood_group: str(p.bloodGroup),
      eta_ms: u64(BigInt(eta)),
    },
    expires: ExpirationTime.fromHours(LIFETIMES.pledgeHours),
  }
}

// ---------- donation_receipt (hospital creates, then transfers to donor) ----------

export type ReceiptInput = {
  requestKey: Hex
  hospitalKey: Hex
  hospitalName: string
  bloodGroup: BloodGroup
  component: Component
  ref: string
  donatedAt?: Date
}

export function receiptEntity(r: ReceiptInput, salt?: bigint) {
  const at = (r.donatedAt ?? new Date()).getTime()
  const nextEligible = at + MIN_DONATION_INTERVAL_DAYS * 86_400_000
  return {
    payload: jsonToPayload({ ref: r.ref, hospitalName: r.hospitalName, component: r.component }),
    contentType: "application/json" as const,
    attributes: {
      ...common(TYPES.receipt),
      request: key(r.requestKey),
      hospital: key(r.hospitalKey),
      blood_group: str(r.bloodGroup),
      donated_at_ms: u64(BigInt(at)),
      next_eligible_ms: u64(BigInt(nextEligible)),
    },
    expires: ExpirationTime.fromDays(LIFETIMES.receiptDays),
    // A receipt is a certificate: content frozen forever, but it can be handed to the donor.
    flags: { readonly: true },
    ...(salt !== undefined ? { salt } : {}),
  }
}

// ---------- decoding helpers (shared by UI and scripts) ----------

type AttrMap = Record<string, { type: string; value: unknown }> | undefined

export function attrStr(a: AttrMap, name: string): string | undefined {
  const v = a?.[name]
  return v ? String(v.value) : undefined
}
export function attrNum(a: AttrMap, name: string): number | undefined {
  const v = a?.[name]
  if (!v) return undefined
  return typeof v.value === "bigint" ? Number(v.value) : Number(v.value)
}
