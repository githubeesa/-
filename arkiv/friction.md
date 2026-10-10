# Friction report: building Rakt Relay on Arkiv

**Environment for every item below** (unless stated): `@arkiv-network/sdk` **0.8.1**, `viem` **2.57.4**, Node **22.23.3** (linux arm64), `tsx` 4.23, Vite 6.4. Tiramisu testnet (chain `7738577`), public RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. Tested 10 Oct 2026.
Each issue has a script in this repo that reproduces it.

---

## F1. An unfunded wallet produces "Execution error without revert data"

**Surface:** TypeScript SDK, `walletClient.createEntity` / `executeBatch`.
**Steps:** `npm run smoke:write-dry` ([`scripts/dry-run-write.ts`](../scripts/dry-run-write.ts)). It signs a valid `createEntity` with a freshly generated key that holds 0 GLM.
**Expected:** an error that says the wallet has no GLM, ideally with a pointer to the faucet. This is the first thing every new builder hits.
**Actual:** `EntityMutationError: Transaction failed: Execution error without revert data`. The real reason is five `cause` levels down: `RPC Request failed. / out of gas: gas required exceeds: 0`. Nothing mentions balance or GLM.
**Why it matters:** "execution error without revert data" reads like a bug in my attributes or expiry, so I started debugging the payload. We only found the cause by walking `error.cause` by hand (see the loop in the script).
**Suggested fix:** in `utils/arkivTransactions.ts`, when the viem error chain contains `gas required exceeds: 0` or `insufficient funds`, throw an `EntityMutationError` that says "wallet 0x… has 0 GLM on Tiramisu; get test GLM at hub.arkiv.network/faucet". Or do a `getBalance` pre-check when estimation fails.

## F2. `ENTITY_ERRORS_ABI` is not exported, so raw reverts are bare selectors

**Surface:** TypeScript SDK exports, JSON-RPC (`eth_call` / `eth_estimateGas`).
**Steps:** `npm run smoke:simulate` ([`scripts/simulate-writes.ts`](../scripts/simulate-writes.ts)) replays each write as an `eth_call` to validate it against live state without spending GLM. Two negative cases revert.
**Expected:** a way to decode the revert from the package: `import { ENTITY_ERRORS_ABI } from "@arkiv-network/sdk"`, the same way `ENTITY_EVENTS_ABI` is exported.
**Actual:** the node returns `0x66a89f2a…` and `0xd858a824…`. `ENTITY_EVENTS_ABI` is exported (`'ENTITY_EVENTS_ABI' in sdk === true`), but `ENTITY_ERRORS_ABI` is not (`false`). It lives only in `src/utils/arkivTransactions.ts`. We copied its 21 signatures into our script to decode them: `0x66a89f2a` = `EntityNotFound(bytes32)`, `0xd858a824` = `ReadOnlyEntity(bytes32)`.
**Suggested fix:** export `ENTITY_ERRORS_ABI` (and `describeEntityRevert`) from the package root, and list the selectors on the JSON-RPC "Mutating entities" docs page for non-TS clients.

## F3. `watchEntityEvents` is chain-wide with no filter, so every client classifies every event

**Surface:** `watchEntityEvents` over a WebSocket transport (no `fromBlock`).
**Steps:** `npm run smoke:ws` ([`scripts/ws-probe.ts`](../scripts/ws-probe.ts)) subscribes for 45 s.
**Expected:** a way to subscribe only to my project's entities, for example a query expression (`project = str('rakt-relay')`) or a creator/owner filter, the way `select()` has `.where()` and `.createdBy()`.
**Actual:** we received **42 events in 45 s** from other projects on Tiramisu (around 15:30 IST, 10 Oct). `EntityCreated` carries `owner`, which was enough to recognise new requests from verified hospitals. But a pledge comes from an arbitrary donor wallet, so to know whether a new entity is a pledge for a request on screen, the app has to `getEntity()` each unknown event against the rate-limited public RPC. Our first version simply refetched the feed on every `EntityCreated` and would have refetched it about once a second.
**Workaround in code:** [`src/web/main.ts`](../src/web/main.ts) → `startLive()`. We filter by `owner` against verified hospitals, refresh only for on-screen keys, and call `getEntity` only on the two pages where pledges matter.
**Suggested fix:** a server-side filter on the subscription (an attribute predicate, or at least `$creator` / `$owner`), or include the entity's attributes in `EntityCreated` / `EntityPatched` events.

## F4. No ORDER BY, and `limit()` applies before the client can sort

**Surface:** `select().limit().fetch()`. This is documented, but here is its product impact.
**Expected (product need):** "the most urgent compatible requests near me", meaning sorted by urgency, then distance.
**Actual:** results come back newest first only. With more matches than `limit`, an older but critical request could fall off the page.
**What we did:** we made urgency a numeric attribute and filter `urgency <= n` on the node (the donor picks "critical only"), and narrowed by bounding box before sorting on the client. Q2 in `schema.md` shows the resulting query.
**Suggested fix:** even one `orderBy` on an indexed numeric attribute (`asc`/`desc`) would remove this whole class of workaround.

## F5. Counting matches needs a full query per item (N+1 on the feed)

**Surface:** `getEntityCount()`. This is documented as unfiltered.
**Need:** "N donors on the way" on every request card.
**Actual:** `getEntityCount()` counts the whole chain, so each card runs its own `pledgesQuery(...).fetch()`. A feed of 20 requests makes 21 calls to the rate-limited public RPC.
**Suggested fix:** `select(...).where(...).count()` that returns a number from the node.

## F6. The faucet cannot be scripted

**Surface:** Hub faucet (hub.arkiv.network/faucet).
**Observation:** the faucet page's bundle uses `/api/auth` and a `captchaToken`, so funding cannot be automated for CI or for a reviewer's fresh wallet. We did not try to bypass it.
**What we did:** `npm run seed` needs **one** faucet claim (for the steward wallet) and shares GLM with the other four demo wallets by plain transfer. Worth documenting as a pattern for multi-role apps.

---

## Paths we tested that worked as documented

| Surface | What we did | Expected | Result |
|---|---|---|---|
| Query builder on the live node (`npm run smoke:read`) | 6 production queries: `str` eq, `i32` range, `dec` ranges (bbox), `key` eq, nested `or()` inside `where()`, OR over `$creator`, `createdBy`, `ownedBy`, `$expiresAt < u64(...)` | Parsed and type-checked by the node | All 6 accepted (0 results before seeding) |
| `ExpirationTime.atDate(d, { atLeast: fromMinutes(30) })` | Request expiry at the clinical deadline | Accepted | `eth_call` OK |
| `flags: { readonly: true }` | Patch a readonly receipt in the same batch | Revert | Reverted with `ReadOnlyEntity` |
| `predictEntityKeys` + pinned `salt` | Batch: create request + create receipt, patch the request, `changeOwnership` of the receipt, all in one tx | Keys match the prediction, batch applies atomically | `eth_call` OK. The `ReadOnlyEntity` revert above echoes exactly the predicted key |
| Patch on a missing entity | Negative test | Revert | `EntityNotFound` |
| `watchEntityEvents` over `webSocket()` without `fromBlock` | Real subscription | Push events, no polling | 42 events in 45 s |
| `getEntity` on an unknown key in the browser bundle (happy-dom harness) | "Ended, stop forwarding" page | `NoEntityFoundError` | Thrown and rendered correctly |

## To add after the live seed run (Junaid fills these in before submitting)

- Faucet amount received, and GLM spent by `npm run seed` (steward balance before and after): faucet gave 10 GLM to a personal MetaMask wallet; 9 GLM forwarded to the steward. Steward 9 → 4.499659 GLM after seed (4.5 GLM shared to 4 demo wallets, ≈0.000341 GLM in fees for all writes).
- Time from the first `npm install` to the first entity written on Tiramisu: same day (10 Oct 2026). Code and simulated writes were ready earlier; the only blocker to the first real write was getting funded (see F6 and below).
- Anything that broke during the real (non-simulated) seed or the browser wallet flow, nothing broke in the real seed (all batches confirmed first try). Friction hit while funding: (1) the faucet only accepts a connected wallet, so you cannot paste the address of a script-generated key; we had to claim into MetaMask and transfer. (2) After claiming, MetaMask showed no balance until Tiramisu (chain ID 7738577) was added by hand as a custom network; the faucet page offers no "add network" button. Verified on-chain via eth_getBalance that the 10 GLM had arrived.
