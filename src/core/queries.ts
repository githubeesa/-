// Every read Rakt Relay performs. Reads need no wallet and no backend:
// the static web app talks straight to an Arkiv node.

import type { PublicArkivClient } from "@arkiv-network/sdk"
import { addr, dec, i32, key, str, u64 } from "@arkiv-network/sdk/attr"
import { and, eq, gte, lt, lte, or, type Expression } from "@arkiv-network/sdk/query"
import type { Hex } from "viem"
import { type BloodGroup, recipientsFor } from "./compat"
import type { BBox } from "./geo"
import { PROJECT, STATUS, TYPES } from "./schema"

const project = () => eq("project", str(PROJECT))
const ofType = (t: string) => eq("type", str(t))

/** Above this many trusted creators we stop OR-ing `$creator` predicates on the node and
 *  filter client-side instead (keeps us under the node's predicate budget). */
export const MAX_CREATOR_OR = 12

function creatorIn(wallets: Hex[]): Expression | undefined {
  if (wallets.length === 0 || wallets.length > MAX_CREATOR_OR) return undefined
  if (wallets.length === 1) return eq("$creator", addr(wallets[0]!))
  return or(wallets.map((w) => eq("$creator", addr(w))))
}

// ---------- Q1: the trust registry ----------
/** Hospitals verified by our stewards. Trust comes from `$creator` (immutable, unforgeable),
 *  never from an attribute anyone could copy. */
export function hospitalsQuery(client: PublicArkivClient, stewards: Hex[]) {
  const q = client
    .select({ key: true, creator: true, attributes: true, payload: true, expiresAt: true })
    .where(project(), ofType(TYPES.hospital))
  const c = creatorIn(stewards)
  if (c) q.where(c)
  return q.limit(200)
}

// ---------- Q2: the donor feed ----------
export type FeedFilter = {
  hospitalWallets: Hex[] // verified hospital wallets (from Q1)
  donorGroup?: BloodGroup // only requests this donor can serve
  maxUrgency?: number // 1 = critical only, 2 = critical+urgent, 3 = all
  bbox?: BBox // "near me" as four dec range predicates
  city?: string
  limit?: number
}

export function feedQuery(client: PublicArkivClient, f: FeedFilter) {
  const preds: Expression[] = [project(), ofType(TYPES.request), eq("status", str(STATUS.open))]
  if (f.city) preds.push(eq("city", str(f.city)))
  if (f.maxUrgency) preds.push(lte("urgency", i32(f.maxUrgency)))
  if (f.bbox) {
    preds.push(
      gte("lat", dec(f.bbox.minLat)),
      lte("lat", dec(f.bbox.maxLat)),
      gte("lng", dec(f.bbox.minLng)),
      lte("lng", dec(f.bbox.maxLng)),
    )
  }
  const q = client
    .select({ key: true, creator: true, attributes: true, payload: true, expiresAt: true })
    .where(and(preds))
  if (f.donorGroup) {
    q.where(or(recipientsFor(f.donorGroup).map((g) => eq("blood_group", str(g)))))
  }
  const c = creatorIn(f.hospitalWallets)
  if (c) q.where(c)
  return q.limit(f.limit ?? 50)
}

// ---------- Q3: pledges for one request ----------
export function pledgesQuery(client: PublicArkivClient, requestKey: Hex) {
  return client
    .select({ key: true, creator: true, attributes: true, expiresAt: true })
    .where(project(), ofType(TYPES.pledge), eq("request", key(requestKey)))
    .limit(200)
}

// ---------- Q4: a hospital's own requests (dashboard) ----------
export function hospitalRequestsQuery(client: PublicArkivClient, hospitalWallet: Hex) {
  return client
    .select({ key: true, creator: true, attributes: true, payload: true, expiresAt: true })
    .where(project(), ofType(TYPES.request))
    .createdBy(hospitalWallet)
    .limit(100)
}

// ---------- Q5: a hospital's open requests that expire within `withinBlocks` ----------
export function expiringSoonQuery(
  client: PublicArkivClient,
  hospitalWallet: Hex,
  headBlock: bigint,
  withinBlocks: bigint,
) {
  return client
    .select({ key: true, attributes: true, expiresAt: true })
    .where(project(), ofType(TYPES.request), eq("status", str(STATUS.open)))
    .where(lt("$expiresAt", u64(headBlock + withinBlocks)))
    .createdBy(hospitalWallet)
    .limit(100)
}

// ---------- Q6: a donor's receipts (owned, but created by a hospital) ----------
export function receiptsQuery(client: PublicArkivClient, donor: Hex) {
  return client
    .select({ key: true, creator: true, owner: true, attributes: true, payload: true, expiresAt: true })
    .where(project(), ofType(TYPES.receipt))
    .ownedBy(donor)
    .limit(100)
}

/** Seconds until a block, at Arkiv's 2-second block time. */
export function secondsUntil(expiresAt: bigint, head: bigint): number {
  return Number(expiresAt - head) * 2
}
