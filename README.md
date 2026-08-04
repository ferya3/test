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
                    │ DELIVERED │──▶ window lapses ──▶ COMPLETED (payout queued)
                    └─────┬─────┘
                          │ either side escalates
                          ▼
                    ┌──────────┐  moderator decides
                    │ DISPUTED │──▶ COMPLETED  or  REFUNDED
                    └──────────┘
```

* **One deposit address per deal**, derived from a watch-only extended public key.
* **Credentials encrypted at rest** with AES-256-GCM under a key derived per deal.
* **The vault stays sealed** until the escrow is funded and the seller has delivered.
* **Auto-release** protects sellers from a buyer who simply stops responding.
* **Disputes** freeze the deal for a moderator to release or refund.
* **Append-only audit trail** for every payment, reveal, release and admin action.

## Stack

| Layer     | Choice                                               |
| --------- | ---------------------------------------------------- |
| Framework | Next.js 16 (App Router, Server Actions), React 19    |
| Language  | TypeScript                                           |
| Styling   | Tailwind CSS 4                                       |
| Database  | Prisma 7 + SQLite (swap the datasource for Postgres) |
| Chain     | TRON / TRC-20 USDT via TronGrid                      |

## Getting started

```bash
npm install
cp .env.example .env          # then fill in the two keys below
npx prisma db push            # create the schema
npm run db:seed               # optional demo data
npm run dev                   # http://localhost:3000
npm run watcher               # in a second terminal: chain watcher + timers
```

Generate the two secrets with `openssl rand -hex 32`:

```
SESSION_SECRET=…
CREDENTIAL_MASTER_KEY=…       # losing this makes every stored credential unrecoverable
```

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
offline treasury operations. The admin **Treasury** page queues each payout and refund, and the
operator records the transaction hash after broadcasting it from the offline wallet.

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Development server                                        |
| `npm run build`     | Generate the Prisma client and build for production       |
| `npm run watcher`   | Poll deposit addresses, expire unpaid deals, auto-release |
| `npm run db:push`   | Apply the schema                                          |
| `npm run db:seed`   | Load demo users, listings and deals                       |
| `npm test`          | Unit tests (money maths, encryption, address derivation)  |
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
src/lib/payments.ts       idempotent on-chain payment crediting
src/lib/tron.ts           TronGrid TRC-20 reader
src/app/actions/          server actions (auth, deals, admin)
src/app/admin/            operations console: disputes, treasury, users, settings
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
