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
* **The buyer ticks off each vault item**, so a part-delivered lot shows exactly which asset is missing.
* **One deposit address per deal** derived from a watch-only extended public key, or one shared
  address per network that the operator publishes — either works.
* **Credentials encrypted at rest** with AES-256-GCM under a key derived per deal.
* **The vault stays sealed** until the escrow is funded and the seller has delivered.
* **Auto-release** protects sellers from a buyer who simply stops responding — but never fires on a
  deal where the buyer rejected an item, because that buyer did not stop responding.
* **The fee is added on top** of the sale price, so a seller receives exactly what they asked for.
* **Disputes** freeze the deal for a moderator to release or refund.
* **Append-only audit trail** for every payment, reveal, release and admin action.
* **Password management**: self-service reset by email, plus an audited operator reset.

## Receiving addresses

Each deal is opened on one network — TRC-20, BEP-20 or ERC-20 — and every address on it is validated
for that chain.

There are two ways to take deposits, and the platform supports both:

* **Per-deal derived addresses.** Set a watch-only xpub and each deal gets its own address, derived
  for the right chain (base58 for TRON, `0x…` for the EVM chains). Payments match themselves and the
  watcher funds the deal automatically. Without an xpub, deals carry no address of their own.
* **One shared address per network.** Set an address under Admin → Settings → Receiving wallets and
  buyers send there. A shared address cannot be matched to a deal on its own, so the buyer tells the
  operator and the operator credits it from the user's page. The deposit panel says so plainly rather
  than pretending the match is automatic.

A deal cannot be opened on a network that has neither, so nobody is ever shown a deal with nowhere to
pay into.

## Item-by-item confirmation

A lot of five assets does not arrive all at once. The buyer marks each vault item as working or
reports a problem against it, and the deal shows a running count. Releasing while items are still
outstanding is possible — sometimes that is the right call — but the buyer is told exactly what they
are paying for first.

## Passwords

Users change their own password under Settings, which signs out every other device but keeps the one
they are on — so a password change actually evicts whoever prompted it.

An operator can set a password for a user who has lost access, under Admin → Users → the account. It
carries a mandatory reason, destroys every session the user has, and is written to the audit trail
against the admin who did it. It is a real power — knowing a password means being able to read that
user's credential vault — so treat it as a support action of last resort, verify who you are talking
to first, and tell them to change it immediately.

**Forgot password** sends a link that works once and expires in an hour. The form answers the same
way whether or not the address is registered, so it cannot be used to discover who has an account
here, and it is rate-limited per address as well as per IP. Only the hash of the link is stored;
using it signs the account out on every device, which evicts anyone who locked the owner out. A
blocked account cannot be reset — the operator has to lift the block first.

## Email

`MAIL_PROVIDER=console` (the default) prints messages to the server log instead of sending them, so
you can follow a reset link straight from the terminal in development. For real delivery:

```
MAIL_PROVIDER=smtp
MAIL_FROM="EscrowBridge <no-reply@escrowbridge.site>"
SMTP_HOST=…   SMTP_PORT=587   SMTP_USER=…   SMTP_PASSWORD=…
```

Also set `APP_URL` to the address users actually reach — `https://escrowbridge.site` in production. It
is what the links in emails are built from.

## Invoices

Every deal has one at `/deals/<id>/invoice`, reachable from the deal page and readable only by the
buyer, the seller and an operator. It prints — the browser's own dialog covers "save as PDF" on every
platform — and the page chrome drops away when it does.

A deal can be **itemised**: name each thing being bought with its own amount when you open the deal,
and the invoice lists them line by line. The amounts must add up to the sale price — `createDeal`
refuses the deal otherwise, so an invoice can never disagree with what was escrowed. Leave the items
blank and the lot is invoiced as one line.

The split matters: the sale price is shown as **held in escrow, not a charge by the platform**, and
only the fee is billed as a service. On a 9,000 USDT deal at 5% that reads 9,000 + 450 = 9,450, with
a line saying the 9,000 goes to the seller on release. An invoice that claimed the whole 9,450 as
platform revenue would be wrong in a way an accountant would notice.

The document is dated from when the deal was funded rather than when the page was opened, so
reprinting it later does not change it. If the deal is not funded yet, it says so instead of implying
payment.

The issuer's name and address come from Admin → Settings, alongside the `/imprint` page. They ship
mostly blank on purpose: an address on an invoice is where people turn up when something goes wrong,
so it has to be one that actually reaches you.

## Time

Every displayed timestamp is rendered in one fixed zone, `NEXT_PUBLIC_DISPLAY_TIMEZONE`
(`Asia/Tehran` by default). A server almost always runs in UTC, so without this a deal delivered at
22:40 Tehran showed as 02:10 the *following* day — and the server and the browser disagreed with each
other on top of that.

A deal's history is evidence when a trade is disputed, so it has to read the same for everyone
looking at it. Set this to the zone your operators work in.

## Balances and the ledger

Settlement lands on a **platform balance** rather than going straight on-chain: a completed deal
credits the seller, a refund credits the buyer, and either can then withdraw. Buyers with credit can
fund a new deal instantly instead of waiting for a confirmation.

Every movement goes through `postEntry` in `src/lib/ledger.ts`, which writes the balance and the
entry explaining it in one transaction, refuses to go below zero, and stores the resulting balance on
the entry. Nothing else in the codebase may write `User.balanceMicro`.

The treasury page recomputes every balance from its history on each load and shows a loud warning if
a stored value disagrees — that mismatch is the signature of a write that bypassed the ledger.

The platform fee is charged **on top of the sale price**: on a 9,000 USDT deal at 5% the buyer funds
9,450 and the seller receives the full 9,000 they asked for.

**Manual credits** are for money that arrived outside the normal flow, most often a buyer who sent
USDT straight to the treasury wallet instead of a deal's deposit address. Find them under
Admin → Users → the account, enter the amount and a reason, and it lands on their balance with your
name against it. Crediting does not move any USDT — it records a debt the treasury must be able to
cover, so only credit what you have actually received.

**Undoing one** is the same form: pick *Debit* for part of it, or *Zero* to take the whole balance
back to nothing. Zero reads the amount from the account rather than from a number you retype, so a
reversal cannot leave a few USDT behind. Both leave the original credit on the ledger with the
correction beneath it — the history stays readable, which is the point of an append-only ledger.
Note that a debit only moves the number: if the user has already withdrawn, reversing the credit
here does not bring the USDT back.

## Stack

| Layer     | Choice                                               |
| --------- | ---------------------------------------------------- |
| Framework | Next.js 16 (App Router, Server Actions), React 19    |
| Language  | TypeScript                                           |
| Styling   | Tailwind CSS 4                                       |
| Database  | Prisma 7 + SQLite (swap the datasource for Postgres) |
| Chains    | USDT on TRON (TRC-20), BNB Smart Chain (BEP-20), Ethereum (ERC-20) |

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

### On an Ubuntu server

`scripts/install.sh` does the whole sequence — Node 22, dependencies, `.env`, the database, the
production build, and pm2 — and is safe to re-run if a step fails:

```
bash scripts/install.sh
```

Set `SEED_DEMO_DATA=no` to skip the demo accounts.

Then, once the domain's A record points at the server:

```
sudo bash scripts/setup-nginx.sh escrowbridge.site
```

That replaces nginx's default site — the one responsible for the "Welcome to nginx!" page — with a
proxy to the app, forwards `X-Forwarded-For` so the per-IP rate limits see real visitors rather than
`127.0.0.1`, and runs certbot. `SKIP_TLS=yes` leaves it on plain HTTP.

### 502 Bad Gateway

nginx is up and the app behind it is not. `pm2 list` says which. The usual cause is a reboot on a
server where pm2 was never registered as a boot service: `pm2 save` records which processes should
run, but something has to start pm2 itself, and that is `pm2 startup`. The installer does this now;
on a server built before it did:

```
pm2 start npm --name escrowbridge -- start
pm2 start npm --name escrowbridge-watcher -- run watcher
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u $USER --hp $HOME
```

If pm2 shows the app as running and the 502 persists, it is exiting on startup — `pm2 logs
escrowbridge --lines 50` has the reason, most often a `.env` value that was edited and left invalid.

**After pulling a change that touches `prisma/schema.prisma`, re-run `npm run db:push`.** Prisma 7
does not regenerate its client as a side effect of applying the schema, and a stale client reports
newly added fields as unknown.

`npm run setup` fills in the two secrets for you and is safe to re-run — it never overwrites a value
that is already set. **Back up `CREDENTIAL_MASTER_KEY`**: lose it and every stored credential becomes
permanently unreadable.

The **first account to register becomes the administrator**. After that, everyone signs up as a
regular user who can both buy and sell.

Seeded demo accounts all share the password `escrow-demo-1`: `admin@escrowbridge.test`,
`buyer@escrowbridge.test`, the demo seller, plus a named buyer whose deal carries a
worked example of the operator relaying the seller's answers.

Both sides of that deal appear on its invoice, so point them at the real addresses:

```
DEMO_BUYER_EMAIL=you@example.com DEMO_SELLER_EMAIL=them@example.com npm run db:seed
```

`DEMO_SELLER_NAME` renames the seller to match.

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

The password-reset spec reads the emailed link out of the dev server log, so point `E2E_DEV_LOG` at
it: `E2E_DEV_LOG=dev.log npm run test:e2e`.

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

## Landing page figures

The home page shows members and completed deals as **an operator-set baseline plus the real count**,
both under Admin → Settings. They ship at 4,000 and 1,800. Visitors read these as a claim about how
established the platform is, which is exactly why they are a setting you can correct rather than a
number buried in the source.

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
