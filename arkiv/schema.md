# Rakt Relay: Arkiv schema

Network: **Tiramisu testnet** (chain ID `7738577`), SDK `@arkiv-network/sdk` 0.8.1.
Source of truth in code: [`src/core/schema.ts`](../src/core/schema.ts) (writes), [`src/core/queries.ts`](../src/core/queries.ts) (reads), [`src/core/actions.ts`](../src/core/actions.ts) (mutations).

Every entity carries `project = str("rakt-relay")`, `type = str(<entity type>)`, `schema_v = i32(1)`, and every query filters on `project` and `type`.
**All data is synthetic.** No real person, hospital, licence or phone number is stored. By design, the schema has no field for a patient's name, phone number, diagnosis or bed.

## Roles (wallets)

| Role | Creates | Trusted because |
|---|---|---|
| **Steward** (e.g. State Blood Transfusion Council, IMA branch, Red Cross chapter) | `hospital` attestations | Its address is in the app's published trust list (`src/deployment.json → stewards`) |
| **Hospital blood centre** | `blood_request`, `donation_receipt` | A live `hospital` entity whose `$creator` is a steward names this wallet in `hospital_wallet` |
| **Donor** | `pledge` | Nobody needs to trust a pledge. It is a pseudonymous "I'm coming" that expires on its own |

Trust always comes from **`$creator`** (immutable, set by the chain), never from an attribute. An imposter can copy every attribute (the seed script does exactly that), but cannot forge `$creator`.

## Entity types

### 1. `hospital`: a steward's attestation of a blood centre wallet

| Part | Name | Type | Why |
|---|---|---|---|
| attr | `hospital_wallet` | `addr` | The wallet allowed to post requests for this centre. Lookup key for `$creator` checks |
| attr | `city` | `str` | Area filter |
| attr | `state` | `str` | ISO 3166-2:IN code |
| attr | `lat`, `lng` | `dec` | Ranged, so "near me" is answered by the node |
| attr | `has_blood_centre` | `bool` | Reserved for storage-centre-only hospitals |
| payload (JSON) | `name`, `address`, `bloodCentreDesk`, `licenceRef`, `synthetic` | | Display only, never filtered |
| **flags** | `readonly: true` | | An attestation must not be edited in place. To change it, the steward deletes it and issues a new one, so the change is visible on chain |
| **Entity Expiration** | `fromDays(365)` | | Verification is re-checked every year. An unrenewed centre drops out of the app automatically |
| owner | steward | | Only the steward can revoke (`deleteEntity`) |

### 2. `blood_request`: one need at one blood centre

| Part | Name | Type | Why |
|---|---|---|---|
| attr | `hospital` | `key` | Reference to the `hospital` attestation entity |
| attr | `blood_group` | `str` | `O-`…`AB+`. Matched with an OR over the donor's compatible recipient groups |
| attr | `component` | `str` | `whole`, `prbc`, `platelets`, `plasma` |
| attr | `units_needed` | `i32` | |
| attr | `units_received` | `i32` | Incremented atomically when a donation is confirmed |
| attr | `urgency` | `i32` | 1 critical, 2 urgent, 3 planned. Numeric so the node can filter `urgency <= n` |
| attr | `status` | `str` | `open`, `fulfilled`, `cancelled` |
| attr | `city` | `str` | |
| attr | `lat`, `lng` | `dec` | Bounding-box range queries |
| attr | `needed_by_ms` | `u64` | Clinical deadline (ms). Shown to donors. Also drives the expiry |
| attr | `ref` | `str` | Slip number the donor quotes at the counter (synthetic) |
| payload (JSON) | `ref`, `hospitalName`, `note` | | Free text for donors. The UI rejects notes containing 10-digit numbers or `@` |
| **Entity Expiration** | `atDate(neededBy, { atLeast: fromMinutes(30) })` | | **The request dies when the need dies.** An exact deadline at the clinical "needed by" time, with a 30-minute floor so a last-minute post is not dead on arrival |
| **Lifetime Extension** | `extendEntity(fromHours(12))` (hospital-only) | | The "still needed" button: a lease renewed by a human who checked the ward, not a cron job |
| patch | `status`, `units_received` | | Closing early keeps the entity (marked) until expiry, so anyone opening a forwarded link sees "fulfilled, stop forwarding" |
| owner | hospital | | |

### 3. `pledge`: a donor's "I'm on my way"

| Part | Name | Type | Why |
|---|---|---|---|
| attr | `request` | `key` | The request it answers. Queried with `eq("request", key(k))` |
| attr | `blood_group` | `str` | The donor's self-declared group (the blood centre always re-tests) |
| attr | `eta_ms` | `u64` | When the donor expects to arrive |
| payload (JSON) | `etaMinutes` | | |
| **Entity Expiration** | `fromHours(6)` | | A pledge that has not turned into a donation within 6 h is noise. It vanishes so the hospital's "donors on the way" count never overstates |
| identity | donor wallet only | | No name, no phone. The donor walks to the counter named on the request |

### 4. `donation_receipt`: the donor's verifiable certificate

| Part | Name | Type | Why |
|---|---|---|---|
| attr | `request`, `hospital` | `key` | Provenance |
| attr | `blood_group` | `str` | |
| attr | `donated_at_ms` | `u64` | |
| attr | `next_eligible_ms` | `u64` | donated_at + 90 days (conservative whole-blood interval, shown as guidance only) |
| payload (JSON) | `ref`, `hospitalName`, `component` | | |
| **flags** | `readonly: true` | | A certificate must not change after issue |
| **Entity Expiration** | `fromDays(365)` | | The donor's record for the year |
| **`$creator` / `$owner`** | creator = hospital, owner = donor | | Created by the hospital, then **transferred to the donor** in the same batch. The donor owns it, and anyone can verify who issued it |

## Writes

| Action | Who | Arkiv operation(s) | Code |
|---|---|---|---|
| Attest centre(s) | steward | `createEntity` / `executeBatch({creates})` | `verifyHospital(s)` |
| Revoke centre | steward | `deleteEntity` | UI `revoke` |
| Post request | hospital | `createEntity` | `postRequest` |
| Still needed | hospital | `extendEntity` | `extendRequest` |
| Fulfilled / cancel | hospital | `patchEntity({set:{status}})` | `closeRequest` |
| Pledge | donor | `createEntity` | `pledge` |
| **Confirm donation** | hospital | **one `executeBatch`**: create `donation_receipt` (key from `predictEntityKeys`, salt pinned) + patch request `units_received` (and `status` when met) + `changeOwnership` of the new receipt to the donor | `confirmDonation` |

## Queries the app runs (exact strings)

These were captured from `npm run smoke:read`, which sends each one to the live Tiramisu node (`<…>` marks values filled in at runtime).

**Q1 Trust registry**, `hospitalsQuery`:
```
project = str('rakt-relay') AND type = str('hospital') AND $creator = addr(<steward>)
```
(With several stewards, an OR over `$creator`.)

**Q2 Donor feed**, `feedQuery` (example: O+ donor, Bengaluru, 15 km, critical+urgent):
```
project = str('rakt-relay') AND type = str('blood_request') AND status = str('open') AND city = str('bengaluru')
AND urgency <= i32(2)
AND lat >= dec(12.836853) AND lat <= dec(13.106347) AND lng >= dec(77.456325) AND lng <= dec(77.732875)
AND (blood_group = str('O+') OR blood_group = str('A+') OR blood_group = str('B+') OR blood_group = str('AB+'))
AND ($creator = addr(<hospital wallet 1>) OR $creator = addr(<hospital wallet 2>))
```
The web app omits `city` and uses only the bounding box. Up to 12 trusted creators are OR-ed on the node; above that the app filters `$creator` on the client (node predicate budget). Results come back newest first, and the app then sorts by urgency, then distance.

**Q3 Pledges for a request**, `pledgesQuery`:
```
project = str('rakt-relay') AND type = str('pledge') AND request = key(<request key>)
```

**Q4 Hospital dashboard**, `hospitalRequestsQuery`:
```
project = str('rakt-relay') AND type = str('blood_request') AND $creator = addr(<hospital wallet>)
```

**Q5 Expiring within 3 h**, `expiringSoonQuery` (5,400 blocks × 2 s):
```
project = str('rakt-relay') AND type = str('blood_request') AND status = str('open') AND $expiresAt < u64(<head + 5400>) AND $creator = addr(<hospital wallet>)
```

**Q6 Donor's receipts**, `receiptsQuery`:
```
project = str('rakt-relay') AND type = str('donation_receipt') AND $owner = addr(<donor wallet>)
```
The UI then checks that each receipt's `$creator` is a verified hospital.

**Single request (the forwarded WhatsApp link)**: `getEntity(<key>)`. `NoEntityFoundError` is shown as "This request has ended, please stop forwarding".

**Live updates**: `watchEntityEvents` over a **WebSocket** transport with no `fromBlock` (a real subscription, not polling). `EntityCreated` events whose `owner` is a verified hospital refresh the feed. Patch, extend and delete events for on-screen keys refresh the view. On a request page or the hospital desk, an unknown creator's new entity is read once to detect a `pledge` for an on-screen request.

## What deliberately stays OFF Arkiv

- **Patient identity, phone numbers, diagnosis, bed numbers.** Never collected. Donors go to the blood centre counter and quote the slip `ref`.
- **Donor identity** (name, phone, Aadhaar, medical history). The donor is a wallet address. Screening happens at the blood centre, as it must by law.
- **Blood stock levels.** That belongs to e-RaktKosh, the national system. We route people to a centre, we do not duplicate inventory.
- **Matching, ranking and distance sorting** run in the browser, because there is no server-side ORDER BY.
- **Private keys.** Kept in `.env` (gitignored) or the user's wallet. Never in an entity.
