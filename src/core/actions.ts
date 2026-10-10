// Every write Rakt Relay performs. Each one is a signed transaction from the
// wallet that plays that role: steward, hospital or donor.

import { ExpirationTime, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk"
import { i32, str } from "@arkiv-network/sdk/attr"
import type { Hex } from "viem"
import {
  hospitalEntity,
  type HospitalInput,
  LIFETIMES,
  pledgeEntity,
  type PledgeInput,
  receiptEntity,
  type ReceiptInput,
  requestEntity,
  type RequestInput,
  STATUS,
} from "./schema"

type W = WalletArkivClient

/** Steward: attest that `hospitalWallet` speaks for this blood centre. */
export async function verifyHospital(w: W, h: HospitalInput) {
  return w.createEntity(hospitalEntity(h))
}

/** Steward: verify many hospitals in one atomic transaction (one nonce, all-or-nothing). */
export async function verifyHospitals(w: W, hs: HospitalInput[]) {
  return w.executeBatch({ creates: hs.map(hospitalEntity) })
}

/** Hospital: post a request. */
export async function postRequest(w: W, r: RequestInput) {
  return w.createEntity(requestEntity(r))
}

/** Hospital: "still needed" — a Lifetime Extension renewed by real activity. */
export async function extendRequest(w: W, requestKey: Hex, hours: number = LIFETIMES.extendHours) {
  return w.extendEntity({ entityKey: requestKey, expires: ExpirationTime.fromHours(hours) })
}

/** Hospital: close a request early. The entity stays (marked) until its expiry so anyone who
 *  opens a forwarded link sees "fulfilled — please stop forwarding". */
export async function closeRequest(w: W, requestKey: Hex, status: "fulfilled" | "cancelled") {
  return w.patchEntity({ entityKey: requestKey, set: { status: str(STATUS[status]) } })
}

/** Donor: "I'm on my way". Pseudonymous: the only identity is the donor's wallet address. */
export async function pledge(w: W, p: PledgeInput) {
  return w.createEntity(pledgeEntity(p))
}

/**
 * Hospital: confirm a donation, as ONE atomic batch:
 *   1. create a readonly donation_receipt (key predicted in advance),
 *   2. patch the request's units_received (and status if the need is met),
 *   3. hand the receipt to the donor's wallet (changeOwnership).
 * Either all three land or none do, so a receipt never exists without the counter moving,
 * and the counter never moves without the donor getting their receipt.
 */
export async function confirmDonation(
  w: W,
  pub: PublicArkivClient,
  args: ReceiptInput & { donor: Hex; unitsReceivedSoFar: number; unitsNeeded: number },
) {
  const owner = w.account!.address
  const [predicted] = await pub.predictEntityKeys({ owner, count: 1 })
  const received = args.unitsReceivedSoFar + 1
  const set: Record<string, ReturnType<typeof i32> | ReturnType<typeof str>> = {
    units_received: i32(received),
  }
  if (received >= args.unitsNeeded) set.status = str(STATUS.fulfilled)
  const res = await w.executeBatch({
    creates: [receiptEntity(args, predicted.salt)],
    patches: [{ entityKey: args.requestKey, set }],
    ownershipChanges: [{ entityKey: predicted.key, newOwner: args.donor }],
  })
  return { ...res, receiptKey: predicted.key }
}
