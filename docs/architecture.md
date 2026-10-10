# Architecture

```
                   ┌──────────────────────── Arkiv · Tiramisu testnet ────────────────────────┐
                   │  hospital (readonly, 1y)   blood_request (expires at needed-by)          │
                   │  pledge (6h)               donation_receipt (readonly, 1y, donor-owned)  │
                   └───────▲──────────────▲────────────────▲──────────────────▲──────────────┘
          createEntity /   │  select()     │ getEntity()    │ watchEntityEvents │ executeBatch
          deleteEntity     │  (HTTP)       │ (HTTP)         │ (WebSocket)       │ extend / patch
                           │               │                │                   │
 ┌──────────────┐   ┌──────┴───────────────┴────────────────┴───────────────────┴────┐
 │ Steward      │──▶│                Static web app (GitHub Pages)                   │
 │ wallet       │   │  src/core/schema.ts   one builder per entity type + lifetimes  │
 └──────────────┘   │  src/core/queries.ts  Q1..Q6 (all reads)                        │
 ┌──────────────┐   │  src/core/actions.ts  all writes, incl. atomic confirmDonation  │
 │ Hospital     │──▶│  src/web/main.ts      router, views, live events, i18n         │
 │ wallet       │   │  src/web/chain.ts     public client (HTTP), WS client, wallets  │
 └──────────────┘   └────────────────────────────────────────────────────────────────┘
 ┌──────────────┐          ▲  WhatsApp link  https://…/#/r/<entityKey>
 │ Donor wallet │──────────┘  (always shows live status; "ended" after expiry)
 └──────────────┘
```

There is **no server**. The browser reads Arkiv directly with the public client, and writes are signed by the user's wallet (MetaMask, or a testnet key held in the browser). Node scripts reuse the same `src/core` modules, so the seed data, the UI and `arkiv/schema.md` describe one schema.

## Trust model

1. The app ships a **steward list** (`src/deployment.json → stewards`). This list is the only configuration that matters, and it is public. A state health authority could publish its own list, and anyone can fork the app with a different one.
2. **Q1** loads `hospital` entities where `$creator ∈ stewards`. Each one maps a `hospital_wallet` to a blood centre.
3. A request is displayed only if its `$creator` is one of those hospital wallets: on the node (OR over `$creator`, up to 12) and again in the browser. An imposter can copy every attribute, but not `$creator`.
4. Revoking a centre is `deleteEntity` by the steward. Its requests vanish from every client on the next query. Attestations also lapse after a year unless re-issued.

## Lifecycle of a request

```
hospital posts ──▶ open ──(pledges arrive, 6h each)──▶ hospital confirms donation (batch)
     │                │                                  ├─ create receipt (readonly, predicted key)
     │                │                                  ├─ patch units_received (+status if met)
     │                │                                  └─ changeOwnership(receipt → donor)
     │                ├──"still needed"──▶ extendEntity (lease renewed by a human check)
     │                └──fulfilled/cancelled──▶ patch status (stays visible as "stop forwarding")
     └──────────────▶ Entity Expiration at needed-by ──▶ gone for every client, link shows "ended"
```

## Why each lifetime is what it is

| Entity | Lifetime | Product reason |
|---|---|---|
| `blood_request` | `atDate(neededBy)`, ≥ 30 min | A request is only true until the clinical deadline. That is the anti-stale-forward guarantee |
| `pledge` | 6 h | An unfulfilled "I'm coming" turns into noise within hours |
| `hospital` | 365 d | Annual re-verification, so stale attestations fall out on their own |
| `donation_receipt` | 365 d | The donor's record for the year (next-eligible date is shown) |

## Failure modes considered

- **Public RPC rate limits.** Reads are few per view: 1 feed query plus 1 pledge query per card (see friction F5). Live events are classified locally first (F3). A free Arkiv Hub access key can be set via `VITE_ARKIV_RPC_URL` at build time, but it then becomes visible in the browser, as the docs warn.
- **WebSocket unavailable.** The UI still works; it just shows "○ live off" and updates on navigation.
- **Steward key compromise.** The steward is a single key in this demo. In production it would be a multisig, or several independent stewards (the app already supports a list).
- **Donor without GLM.** On testnet, use the faucet. In production, a paymaster or relayer would sponsor pledges (out of scope).
