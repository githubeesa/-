# 🩸 Rakt Relay

**Verified blood requests for India that disappear when the need does.**
Built on [Arkiv](https://arkiv.network), the Web3 database · Tiramisu testnet · no backend · MIT.

> **Live app:** https://githubeesa.github.io/-/
> **Demo video (≤ 3 min):** `<link>` · **Schema:** [`arkiv/schema.md`](arkiv/schema.md) · **Friction report:** [`arkiv/friction.md`](arkiv/friction.md)
> Track: **Best Indian Use Case** · All data in this demo is **synthetic**.

---

## The problem (India, today)

When someone needs blood urgently in India, the family posts "URGENT O-ve needed, call 98xxxxxxx" to WhatsApp groups and social media. That message then:

1. **Never dies.** It keeps being forwarded for weeks after the patient got blood (or after the need ended). Donors call, travel, and find nothing.
2. **Leaks the family's phone number** to strangers. Police in Tamil Nadu (2024) and Kerala (2025) flagged fraudsters who harvest these numbers, pose as donors and demand "travel money" by UPI ([Assam Blood Donor safety guide](https://assamblooddonor.org/resources/blood-donation-scams-india), citing New Indian Express and The420).
3. **Can't be verified.** A fake request looks exactly like a real one.

Meanwhile the need is real. India's clinical demand is estimated at 14.6 million units a year, with a gap of about one million units ([PLOS One national estimation study, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8986005)). Studies describe large "blood deserts" with very low availability within a 60-minute radius ([IndiaSpend, Feb 2026](https://www.indiaspend.com/health/govt-claims-it-is-blood-sufficient-but-is-it-980833)).

## What Rakt Relay does

| Today | With Rakt Relay |
|---|---|
| Forward lives forever | Each request is an Arkiv entity that **expires at its clinical "needed by" time**. The shared link opens a live page, and after expiry it says *"This request has ended. Please stop forwarding it."* |
| Anyone can post a fake | Only wallets **attested by a steward** (e.g. a State Blood Transfusion Council) are shown. The check uses the immutable on-chain `$creator`, so copying the format does nothing. |
| Family's phone number goes viral | **No phone numbers, no names.** The request names the blood centre counter and a slip number. Donors pledge pseudonymously from a wallet. |
| "Is anyone coming?" | Donors tap **"I'm going"**. The hospital desk sees pledges arrive **live** (WebSocket events). Pledges expire after 6 h so counts never overstate. |
| Donor gets nothing verifiable | When the hospital confirms a donation, **one atomic batch** issues a readonly receipt, updates the request counter and **transfers the receipt to the donor's wallet**. |
| One app, one operator | **Static site, no server.** Anyone can rehost it or query Arkiv directly and get the same answer. |

Donor-facing screens are in **English, हिन्दी and ಕನ್ನಡ**.

## Why Arkiv (and not Postgres / IPFS / a subgraph / our own API)

- **Expiry is the product, not housekeeping.** The core promise is that a forwarded request cannot outlive the need. On Arkiv, Entity Expiration removes the request from every query and every `getEntity` at the deadline, for every client, with no cron job. On Postgres that depends on one operator's job running. On IPFS, content never dies.
- **Verifiable authorship without trusting us.** `$creator` is set by the chain. A judge, a hospital, or a rival app can check that a request came from an attested wallet without trusting Rakt Relay. With our own API, the question "is this real?" only moves to "do you trust this API?".
- **Live, queryable, and writable from the browser.** We need typed, ranged queries (blood-group OR, urgency, lat/lng bounding box), mutable state (`status`, `units_received`) and live events. IPFS is immutable and unqueryable. A subgraph indexes contracts we would also have to write and deploy, and adds an indexer someone has to run.
- **No backend to shut down, censor or breach.** No server holds a list of donors or patients, because none exists.

**Deliberately kept off Arkiv:** patient identity, phone numbers, diagnosis, donor identity and medical history, blood stock (that is e-RaktKosh's job), private keys. Distance sorting runs in the browser.

## How we use Arkiv (each feature → what the user sees)

| Feature | Where | What the user sees |
|---|---|---|
| Typed attributes vs payload | `src/core/schema.ts` | Filters (group, urgency, location, status) are typed attributes; human text is the payload |
| Compound queries: OR, ranges, `$creator`, `$owner`, `$expiresAt` | `src/core/queries.ts` | "Requests *I* can serve, near me, critical first, from real hospitals only" |
| Entity Expiration per type | `LIFETIMES` in schema | Request = clinical deadline · pledge = 6 h · attestation = 1 yr · receipt = 1 yr |
| Lifetime Extension | `extendRequest` | Hospital's **"Still needed: extend 12h"** button |
| `$creator` trust + `changeOwnership` | registry + `confirmDonation` | ✓ Verified badge, ⚠ "unverified, do not forward", donor-owned receipts |
| Creation flags (`readonly`) | attestations, receipts | Certificates that can't be edited after issue |
| Atomic batch + `predictEntityKeys` | `confirmDonation`, seeding | Receipt, counter and transfer land together or not at all |
| WebSocket `watchEntityEvents` | `startLive()` | Hospital desk updates the moment a donor pledges, without a refresh loop |

Full details: [`arkiv/schema.md`](arkiv/schema.md).

---

## For judges: reproduce in 3 minutes (no wallet needed)

```bash
git clone <this repo> && cd rakt-relay
npm install
npm run evidence     # lists every live entity per demo wallet, with explorer links
npm run smoke:read   # sends the app's 6 production queries to Tiramisu and prints the exact query strings
npm test             # unit tests (compatibility table, geo bbox, entity builders, query rendering)
```

In the live app:
1. **Needed near me**: pick group `O-`, area Bengaluru, *Search*. You see verified requests only. Open *"Arkiv query sent by this page"* to see the exact query.
2. Open the imposter link from `src/deployment.json → demoLinks.fakeRequest` as `#/r/<key>`. The entity exists on chain with identical attributes, but the page shows **"NOT from a verified blood centre"** because its `$creator` is not attested.
3. Open the `NM-2203` request (seeded to expire about 15 minutes after seeding), or any expired key. You get **"This request has ended. Please stop forwarding it."**
4. **Steward** tab: the attested centres, their attestation entities and remaining validity.

Wallets that create entities (on-chain evidence): see `src/deployment.json` (`stewards`, `hospitals[].wallet`, `donors[].wallet`, `imposters[].wallet`) and the `evidence` array (tx hash per step).

## For builders: run it yourself (all free)

Prerequisites: Node 20+ (22 recommended), git. Optional: MetaMask.

```bash
npm install
npm run wallets          # creates 5 TESTNET keys in .env (gitignored) and prints addresses
# claim test GLM for the STEWARD address at https://hub.arkiv.network/faucet
npm run seed             # shares GLM, attests 2 centres, posts 7 requests + 1 imposter, pledges,
                         # confirms a donation (atomic batch), extends + closes requests;
                         # writes public evidence to src/deployment.json
npm run dev              # http://localhost:5173
npm run build            # static site in dist/
```

Use the app as a role: click **Connect wallet**, then *Cancel*, and paste a key from `.env` (testnet only) to act as `HOSPITAL_1` (hospital desk), `DONOR`, or `STEWARD`. With MetaMask, the app adds the Tiramisu network for you.

Deploy free on GitHub Pages: push to `main`, then **Settings → Pages → Source: GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes.

### Scripts

| Script | What it does | Needs GLM? |
|---|---|---|
| `npm run smoke:read` | 6 production queries against live Tiramisu | No |
| `npm run smoke:simulate` | Every write (incl. the confirm-donation batch) executed as `eth_call` against live state, plus 2 negative tests | No |
| `npm run smoke:ws` | 45 s WebSocket entity-event subscription | No |
| `npm run smoke:write-dry` | Reproduces friction F1 (unfunded-wallet error) | No |
| `npm run evidence` | Live entities per demo wallet | No |
| `npm run wallets` / `npm run seed` | Create demo wallets / seed synthetic demo | One faucet claim |

## Repository layout

```
src/core/      schema.ts (entity builders + lifetimes) · queries.ts · actions.ts · compat.ts · geo.ts
src/web/       main.ts (UI, router, live events) · chain.ts (clients, wallets) · i18n.ts · style.css
src/deployment.json   public addresses, entity keys, tx hashes (written by seed)
scripts/       wallets, seed, evidence, smoke-read, simulate-writes, ws-probe, dry-run-write
arkiv/         schema.md · friction.md
docs/          architecture.md · demo-script.md · submission.md
```

## Limits and honesty

- **Testnet and synthetic only.** No real hospital, patient or donor data. Hospital names carry "(synthetic)".
- Compatibility is the ABO/RhD **red-cell** table. Plasma and platelet rules differ. The blood centre always cross-matches, and Rakt Relay never makes a clinical decision.
- Real use needs gas sponsorship (donors should not need GLM), steward onboarding with real health authorities, and a native-speaker review of the Hindi and Kannada strings.

## Pre-existing work

None. Everything in this repository was written from 10 October 2026, during the build window. Third-party libraries: `@arkiv-network/sdk`, `viem`, Vite, TypeScript, tsx, dotenv (all via npm).

## License

[MIT](LICENSE) © 2026 Junaid Mmd
