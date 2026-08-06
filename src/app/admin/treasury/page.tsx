import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { reconcile, totalLiability, LEDGER_LABELS, type LedgerKind } from "@/lib/ledger";
import { WITHDRAWAL_LABELS } from "@/lib/withdrawals";
import { explorerAddressUrl, type Network } from "@/lib/wallet";
import { purgeCredentialsAction } from "@/app/actions/admin";
import { Alert, Card, Empty, PageHeader, Stat, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WithdrawalRow } from "@/components/withdrawal-row";

export const metadata = { title: "Treasury" };

export default async function TreasuryPage() {
  const [withdrawals, liability, drift, escrowHeld, recentLedger, purgeable] = await Promise.all([
    prisma.withdrawal.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 80,
      include: { user: { select: { id: true, email: true, displayName: true } } },
    }),
    totalLiability(),
    reconcile(),
    prisma.deal.aggregate({
      where: { status: { in: ["FUNDED", "DELIVERED", "DISPUTED"] } },
      _sum: { amountMicro: true },
    }),
    prisma.ledgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: { select: { id: true, email: true } },
        actor: { select: { email: true } },
      },
    }),
    prisma.deal.findMany({
      where: {
        status: { in: ["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED"] },
        credentials: { some: { purgedAt: null } },
      },
      select: { id: true, reference: true, title: true, completedAt: true, _count: { select: { credentials: true } } },
      take: 50,
    }),
  ]);

  const pending = withdrawals.filter((w) => ["REQUESTED", "APPROVED"].includes(w.status));
  const pendingTotal = pending.reduce((sum, w) => sum + w.amountMicro, 0n);
  const escrow = escrowHeld._sum.amountMicro ?? 0n;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treasury"
        subtitle="What the platform owes, and the transfers waiting to go out."
      />

      {drift.length > 0 && (
        <Alert tone="error">
          <p className="font-semibold">
            {drift.length} account{drift.length === 1 ? "" : "s"} disagree with their ledger.
          </p>
          <p className="mt-1">
            A stored balance no longer matches the sum of its entries, which means something wrote a balance without
            recording why. Investigate before processing any more withdrawals.
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {drift.slice(0, 10).map((row) => (
              <li key={row.userId}>
                <Link href={`/admin/users/${row.userId}`} className="underline">
                  {row.email}
                </Link>
                : stored {formatUsdt(row.stored)} vs ledger {formatUsdt(row.computed)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Owed to users" value={`${formatUsdt(liability)} USDT`} sub="Sum of all balances" />
        <Stat label="Held in escrow" value={`${formatUsdt(escrow)} USDT`} sub="Live deals" />
        <Stat label="Withdrawals pending" value={`${formatUsdt(pendingTotal)} USDT`} sub={`${pending.length} requests`} />
        <Stat
          label="Treasury must cover"
          value={`${formatUsdt(liability + escrow)} USDT`}
          sub="Balances + escrow"
        />
      </div>

      <Alert tone="info">
        The web server holds no private keys. Send each approved withdrawal from the treasury wallet yourself, then
        paste the transaction hash to close it out.
      </Alert>

      <Card title="Withdrawal queue" description={`${pending.length} awaiting action of ${withdrawals.length} shown`}>
        {withdrawals.length === 0 ? (
          <Empty title="No withdrawal requests yet" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {withdrawals.map((withdrawal) => (
              <WithdrawalRow
                key={withdrawal.id}
                id={withdrawal.id}
                userId={withdrawal.user.id}
                userLabel={`${withdrawal.user.displayName} · ${withdrawal.user.email}`}
                amount={formatUsdt(withdrawal.amountMicro)}
                toAddress={withdrawal.toAddress}
                explorerUrl={explorerAddressUrl(withdrawal.network as Network, withdrawal.toAddress)}
                network={withdrawal.network}
                status={withdrawal.status}
                statusLabel={WITHDRAWAL_LABELS[withdrawal.status] ?? withdrawal.status}
                txHash={withdrawal.txHash}
                note={withdrawal.note}
                createdAt={withdrawal.createdAt.toISOString()}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent ledger activity" description="Across every account.">
        {recentLedger.length === 0 ? (
          <Empty title="Nothing recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {recentLedger.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                  {LEDGER_LABELS[entry.kind as LedgerKind] ?? entry.kind}
                </span>
                <Link
                  href={`/admin/users/${entry.user.id}`}
                  className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1 text-slate-300 hover:text-emerald-300"
                >
                  {entry.user.email}
                </Link>
                <span
                  className={`font-semibold ${entry.amountMicro > 0n ? "text-emerald-300" : "text-red-300"}`}
                >
                  {entry.amountMicro > 0n ? "+" : "−"}
                  {formatUsdt(entry.amountMicro < 0n ? -entry.amountMicro : entry.amountMicro)} USDT
                </span>
                {entry.actor && <span className="text-xs text-slate-600">by {entry.actor.email}</span>}
                <span className="w-32 text-right text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Credentials pending purge"
        description="Settled deals still holding secrets. Purging is irreversible and keeps the blast radius of a breach small."
      >
        {purgeable.length === 0 ? (
          <Empty title="Nothing to purge" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {purgeable.map((deal) => (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/deals/${deal.id}`} className="font-mono text-xs text-emerald-300 hover:underline">
                  {deal.reference}
                </Link>
                <span className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1 text-sm text-slate-300">{deal.title}</span>
                <span className="text-xs text-slate-500">{deal._count.credentials} items</span>
                <span className="text-xs text-slate-500">{formatDate(deal.completedAt)}</span>
                <form action={purgeCredentialsAction}>
                  <input type="hidden" name="dealId" value={deal.id} />
                  <SubmitButton
                    className="btn btn-danger"
                    confirm="Permanently destroy the stored credentials for this deal?"
                  >
                    Purge
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
