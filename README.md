# EscrowBridge

An escrow platform for trading digital accounts and other digital goods, settled in **USDT (TRC-20)**.

The buyer sends USDT to the platform instead of to the seller. The platform holds it while the seller
hands over the account credentials through an encrypted vault. The seller is paid only once the buyer
confirms the goods work — or automatically, if the buyer goes quiet past the agreed inspection window.

The interface is in English throughout.

---

## The escrow flow

```
                 ┌──────────────────┐
                 │ AWAITING_PAYMENT │  buyer sends USDT to a per-deal address
                 └────────┬─────────┘
        cancel / expire   │  on-chain confirmation
        ┌─────────────────┤
        ▼                 ▼
  CANCELLED /        ┌─────────┐
   EXPIRED           │ FUNDED  │  seller submits credentials into the vault
                     └────┬────┘
                          ▼
                    ┌───────────┐   buyer confirms, or the inspection
                    │ DELIVERED │──▶ window lapses ──▶ COMPLETED
                    └─────┬─────┘    (payout → seller's balance)
                          │ either side escalates
                          ▼
                    ┌──────────┐  moderator decides
                    │ DISPUTED │──▶ COMPLETED  or  REFUNDED
                    └──────────┘
```

* **A balance per user**, moved only through an append-only ledger that is reconciled on every visit to the treasury page.
* **One deposit address per deal**, derived from a watch-only extended public key.
* **Credentials encrypted at rest** with AES-256-GCM under a key derived per deal.
* **The vault stays sealed** until the escrow is funded and the seller has delivered.
* **Auto-release** protects sellers from a buyer who simply stops responding.
* **Disputes** freeze the deal for a moderator to release or refund.
* **Append-only audit trail** for every payment, reveal, release and admin action.

## Balances and the ledger

Settlement lands on a **platform balance** rather than going straight on-chain: a completed deal
credits the seller, a refund credits the buyer, and either can then withdraw. Buyers with credit can
fund a new deal instantly instead of waiting for a confirmation.

Every movement goes through `postEntry` in `src/lib/ledger.ts`, which writes the balance and the
entry explaining it in one transaction, refuses to go below zero, and stores the resulting balance on
the entry. Nothing else in the codebase may write `User.balanceMicro`.

The treasury page recomputes every balance from its history on each load and shows a loud warning if
a stored value disagrees — that mismatch is the signature of a write that bypassed the ledger.

**Manual credits** are for money that arrived outside the normal flow, most often a buyer who sent
USDT straight to the treasury wallet instead of a deal's deposit address. Find them under
Admin → Users → the account, enter the amount and a reason, and it lands on their balance with your
name against it. Crediting does not move any USDT — it records a debt the treasury must be able to
cover, so only credit what you have actually received.

## Stack

| Layer     | Choice                                               |
| --------- | ---------------------------------------------------- |
| Framework | Next.js 16 (App Router, Server Actions), React 19    |
| Language  | TypeScript                                           |
| Styling   | Tailwind CSS 4                                       |
| Database  | Prisma 7 + SQLite (swap the datasource for Postgres) |
| Chain     | TRON / TRC-20 USDT via TronGrid                      |

## Getting started

Node.js 22 or newer. These four commands are identical on Windows (cmd or PowerShell), macOS and
Linux:

```
npm install          installs dependencies and generates the Prisma client
npm run setup        writes .env and generates the two secrets
npm run db:push      creates the database and regenerates the client
npm run dev          http://localhost:3000
```

Optional: `npm run db:seed` for demo data, and `npm run watcher` in a second terminal for the chain
watcher and the expiry / auto-release timers.

**After pulling a change that touches `prisma/schema.prisma`, re-run `npm run db:push`.** Prisma 7
does not regenerate its client as a side effect of applying the schema, and a stale client reports
newly added fields as unknown.

`npm run setup` fills in the two secrets for you and is safe to re-run — it never overwrites a value
that is already set. **Back up `CREDENTIAL_MASTER_KEY`**: lose it and every stored credential becomes
permanently unreadable.

The **first account to register becomes the administrator**. After that, everyone signs up as a
regular user who can both buy and sell.

Seeded demo accounts (password `escrow-demo-1`): `admin@`, `seller@`, `buyer@escrowbridge.test`.

## Wallet configuration

`WALLET_PROVIDER=mock` (the default) generates fake deposit addresses so you can walk the whole flow
locally — the admin console gets a **Mark as paid** button in this mode. The wallet module refuses to
load in a production build while set to `mock`.

For real money:

```
WALLET_PROVIDER=tron
TRON_ACCOUNT_XPUB=xpub…       # watch-only account key, m/44'/195'/0'
TRONGRID_API_KEY=…
```

Deposit addresses are then derived at `m/44'/195'/0'/0/<index>` from that xpub. **No private key ever
reaches the web server**, which is deliberate: sweeping escrowed funds and paying sellers out are
offline treasury operations. The admin **Treasury** page queues each withdrawal, and the operator
records the transaction hash after broadcasting it from the offline wallet.

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run setup`     | Create `.env` and generate the secrets (cross-platform)   |
| `npm run dev`       | Development server                                        |
| `npm run build`     | Generate the Prisma client and build for production       |
| `npm run watcher`   | Poll deposit addresses, expire unpaid deals, auto-release |
| `npm run db:push`   | Apply the schema and regenerate the Prisma client         |
| `npm run db:seed`   | Load demo users, listings and deals                       |
| `npm test`          | Unit and ledger tests (money, encryption, balances)       |
| `npm run test:e2e`  | Playwright walk-through of the full escrow lifecycle      |
| `npm run typecheck` | `tsc --noEmit`                                            |

The e2e suite drives the mock wallet, so it runs against a development server (see
`playwright.config.ts`); it expects `npm run db:seed` to have been run for the admin account.

## Layout

```
prisma/schema.prisma      data model — money as integer micro-USDT
src/lib/crypto.ts         AES-256-GCM credential envelopes
src/lib/wallet.ts         watch-only HD derivation, address validation
src/lib/deals.ts          escrow state machine, release/refund, timers
src/lib/ledger.ts         balances, the append-only ledger, reconciliation
src/lib/withdrawals.ts    withdrawal requests and their review
src/lib/payments.ts       idempotent on-chain payment crediting
src/lib/tron.ts           TronGrid TRC-20 reader
src/app/actions/          server actions (auth, deals, admin)
src/app/admin/            operations console: disputes, treasury, users, settings
src/app/dashboard/wallet  the user's balance, history and withdrawals
scripts/watcher.ts        long-running chain watcher
```

## Before taking real money

This is a complete, working application, but a few things sit outside the code:

* **Holding customer funds is regulated** in most jurisdictions. Get legal advice on licensing,
  KYC/AML and record-keeping before accepting deposits. `src/app/terms/page.tsx` is a starting
  template, not legal advice.
* Many providers **prohibit account transfers** in their own terms. The platform surfaces this to
  users but cannot enforce it — decide what you will and will not list.
* Move the database to Postgres and the rate limiter to a shared store before running more than one
  instance.
* Add 2FA for accounts and hardware-wallet custody for the treasury.
