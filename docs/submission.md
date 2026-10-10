# Devfolio submission text (copy and paste)

Replace every `<…>` before submitting. Never paste private keys, seed phrases, access keys or RPC URLs that contain a key.

## Standard fields

**Project name:** Rakt Relay

**Tagline (short):** Verified blood requests for India that disappear when the need does.

**Tracks:** ✅ Best Indian Use Case. Optionally also ✅ Security (the app trusts only `$creator`, never a writable field). You can enter several tracks but win at most one prize, and Best Indian Use Case is allocated first.

**Links:** repo `https://github.com/githubeesa/-` · demo video `<YouTube unlisted / Loom / Drive link>` · live app `https://githubeesa.github.io/-/`

**The problem it solves\***
In India, urgent blood requests spread as WhatsApp forwards and social posts. Three things go wrong. (1) They never die: a request keeps circulating for weeks after the patient got blood, and donors travel for nothing. (2) They carry the family's phone number, which fraudsters harvest to pose as donors and demand "travel money" by UPI (cases flagged by police in Tamil Nadu in 2024 and Kerala in 2025). (3) A fake request looks exactly like a real one.

Rakt Relay replaces the forward with a link to a live, verifiable request:
- Only blood-centre wallets attested by a steward (for example a State Blood Transfusion Council) can post, and the check uses the immutable on-chain creator.
- Each request expires at its clinical "needed by" time. After that, the shared link says "This request has ended. Please stop forwarding it."
- No names or phone numbers: donors go to the named blood-centre counter and quote a slip number.
- Donors pledge pseudonymously, and the hospital desk sees pledges arrive live.
- On confirmation, the donor receives a verifiable, read-only donation receipt in their own wallet.

Donor screens are in English, Hindi and Kannada. It is a static site with no backend, and all data lives on Arkiv.

**Challenges I ran into\***
- *An unfunded wallet error that looked like a schema bug.* My first writes failed with "Execution error without revert data". The real cause, "gas required exceeds: 0" (the wallet had no GLM), was five levels deep in `error.cause` (friction F1).
- *Testing writes without spending.* I built a transport wrapper that replays each SDK write as an `eth_call` against live Tiramisu state. Bare revert selectors came back because the SDK does not export its errors ABI, so I copied it to decode `EntityNotFound` and `ReadOnlyEntity` (F2).
- *Live updates without a refresh storm.* Tiramisu's entity events are chain-wide, about 1 per second from other projects. I classify events by `owner` against verified hospitals and only read an entity when it could be a pledge for something on screen (F3).
- *No ORDER BY.* "Most urgent near me" became node-side filters (urgency as `i32`, lat/lng as `dec` ranges) plus a client-side sort (F4).
- *An atomic "confirm donation".* It creates a receipt and transfers it to the donor in the same transaction, using `predictEntityKeys` with a pinned salt.

## Arkiv questions

**1. Live app URL\*:** `https://githubeesa.github.io/-/`

**2. Does any team member hold Indian nationality?\*:** Yes (Junaid Mmd).

**3. Why Arkiv?\***
The product's core promise is that a forwarded blood request cannot outlive the need, cannot be faked, and does not depend on us staying online.
- *Postgres or our own API:* expiry would be a cron job on a server we control, and "is this request real?" would turn into "do you trust our API?". If we went down, were pressured or were breached, every shared link would break or lie.
- *IPFS:* content never expires and cannot be queried or updated, which is the opposite of what we need.
- *A subgraph:* we would have to write and deploy contracts and run an indexer, just to get the typed queries Arkiv gives natively.

On Arkiv, three things hold for every client, including other people's apps:
- Entity Expiration removes a request at its clinical deadline.
- `$creator` proves which attested blood-centre wallet posted it.
- Typed, ranged queries plus WebSocket events let a static page with no backend run the whole workflow.

Deliberately off Arkiv: patient identity, phone numbers, diagnoses, donor identity and medical history, blood stock (that is e-RaktKosh's job), private keys, and distance sorting (done in the browser).

**4. How do you use Arkiv?\*** (links to `src/core/...` on GitHub)
- **Attributes vs payload** ([schema.ts](<repo>/blob/main/src/core/schema.ts)): everything we filter on is typed. `blood_group`, `status` and `city` are `str`; `urgency` and the unit counts are `i32`; `lat`/`lng` are `dec` for ranges; `needed_by_ms` is `u64`; `hospital` and `request` are `key` references. Display text goes in the JSON payload.
- **Queries** ([queries.ts](<repo>/blob/main/src/core/queries.ts)): the donor feed is one compound query (compatible-group OR, `urgency <= n`, a 4-predicate bounding box, OR over verified `$creator`). We also use `createdBy()` for the hospital desk, `ownedBy()` for donor receipts, `$expiresAt < head+5400` for "expiring in 3 h" alerts, and an `eq` on a `key` attribute for pledges.
- **Entity Expiration per type:** request = `atDate(neededBy, {atLeast: 30 min})`, pledge = 6 h, attestation = 365 d, receipt = 365 d. Each follows product logic (see schema.md).
- **Lifetime Extension** ([actions.ts](<repo>/blob/main/src/core/actions.ts) `extendRequest`): the hospital's "Still needed: extend 12h" button, a lease renewed after a human checks the ward.
- **Creation flags:** `readonly` on steward attestations and donation receipts (certificates must not change). Tested: patching one reverts with `ReadOnlyEntity`.
- **`$creator` / `$owner`:** the whole trust model. A request is shown only if `$creator` is an attested hospital, and receipts are `changeOwnership`-ed to the donor. The UI shows ✓ verified or ⚠ "unverified, do not forward" with explorer links.
- **Batch writes** (`confirmDonation`): one `executeBatch` that creates the receipt with a predicted key and pinned salt, patches `units_received`/`status`, and transfers the receipt to the donor. All three land or none do. Stewards also attest centres in one batch.
- **WebSocket events** ([main.ts](<repo>/blob/main/src/web/main.ts) `startLive`): `watchEntityEvents` over `webSocket()` without `fromBlock`. The hospital desk shows a pledge the moment it lands.

**5. Friction report link\*:** `https://github.com/githubeesa/-/blob/main/arkiv/friction.md`

**6. Wallet addresses that create your Arkiv entities\*:** (from `src/deployment.json` after `npm run seed`)
- Steward (attests blood centres): `0x…`
- Hospital 1, Sanjeevani Demo Hospital (posts requests, issues receipts): `0x…`
- Hospital 2, Namma Demo Medical College (posts requests): `0x…`
- Demo donor (pledges, owns a receipt): `0x…`
- Imposter (posts a look-alike scam request the app must reject): `0x…`

**7. Link to schema.md\*:** `https://github.com/githubeesa/-/blob/main/arkiv/schema.md`

**8. How can judges reproduce your Arkiv usage?\***
1. Open the live app and go to *Needed near me*. Choose O-, Bengaluru, 25 km, then Search. Expand "Arkiv query sent by this page" to see the exact query.
2. Open any request: the "Why you can trust this page" box links the creator wallet, the steward attestation and the expiry block on the explorer.
3. Open `#/r/<fakeRequest key from src/deployment.json>`. It shows "NOT from a verified blood centre" although its attributes match a real request.
4. Open `#/r/<NM-2203 key>`. It expired 15 minutes after seeding, so the page shows "This request has ended".
5. From the repo, run `npm install`, then `npm run evidence` (lists live entities per wallet), `npm run smoke:read` (the 6 production queries against Tiramisu) and `npm run smoke:simulate` (every write simulated against live state, no GLM needed).
6. To write yourself: claim faucet GLM for a fresh wallet, click "Connect wallet" in the app, and pledge to a request.

**9. Pre-existing work you reused\*:** None. All code was written from 10 October 2026. Libraries only: @arkiv-network/sdk 0.8.1, viem, Vite, TypeScript, tsx, dotenv.

**10. Arkiv surfaces you used\*:** TypeScript SDK, Direct JSON-RPC (eth_call simulation), WebSocket events, Docs, Hub, Faucet, Block Explorer. *(Add Access keys or Data Explorer only if you actually use them.)*

**12. How long after you started did you write your first Arkiv entity?\*:** `<2 hours or less / 2 to 24 hours / More than a day>`. Answer honestly, based on when you run `npm run seed`.

**13. Which LLMs did you use?\*:** `<e.g. "Claude (via Hark) for code generation and docs">`. Answer honestly.

**14. The one thing Arkiv should improve first\*:** Server-side filtering for `watchEntityEvents` (by attribute, or at least `$creator`/`$owner`). Today every live app has to classify all chain-wide events itself, about one per second on Tiramisu, against a rate-limited RPC.

**15. Open to a 20-minute feedback call?\*:** `<Yes/No>`

**16–17. Declarations\*:** tick both, but only once the repo is public, MIT, and every link works in an incognito window.

**18. Devcon 8 Mumbai (optional):** `<your choice>`
