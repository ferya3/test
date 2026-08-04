import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { OPEN_STATUSES } from "@/lib/deals";
import { env } from "@/lib/env";
import { Alert, Card, Empty, PageHeader, Stat, StatusBadge, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { simulatePaymentAction } from "@/app/actions/deals";

export const metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const [openDeals, disputes, queuedPayouts, escrowHeld, recent] = await Promise.all([
    prisma.deal.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.payout.count({ where: { status: "QUEUED" } }),
    prisma.deal.aggregate({
      where: { status: { in: ["FUNDED", "DELIVERED", "DISPUTED"] } },
      _sum: { amountMicro: true },
    }),
    prisma.deal.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { buyer: { select: { email: true } }, seller: { select: { email: true } } },
    }),
  ]);

  const feesEarned = await prisma.deal.aggregate({
    where: { status: "COMPLETED" },
    _sum: { feeMicro: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Operations overview" />

      {env.walletProvider === "mock" && (
        <Alert tone="warn">
          The wallet is running in <strong>mock</strong> mode: deposit addresses are fake and no chain is being watched.
          Use “Mark as paid” below to walk a deal through the flow. Set <code>WALLET_PROVIDER=tron</code> with a
          watch-only <code>TRON_ACCOUNT_XPUB</code> before taking real money.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open deals" value={openDeals} />
        <Stat label="Open disputes" value={disputes} />
        <Stat label="Payouts queued" value={queuedPayouts} />
        <Stat label="Held in escrow" value={`${formatUsdt(escrowHeld._sum.amountMicro ?? 0n)} USDT`} />
      </div>

      <Stat label="Fees earned (completed deals)" value={`${formatUsdt(feesEarned._sum.feeMicro ?? 0n)} USDT`} />

      <Card title="Latest deals">
        {recent.length === 0 ? (
          <Empty title="No deals yet" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {recent.map((deal) => (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/deals/${deal.id}`} className="font-mono text-xs text-emerald-300 hover:underline">
                  {deal.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{deal.title}</span>
                <span className="text-xs text-slate-500">
                  {deal.buyer.email} → {deal.seller.email}
                </span>
                <span className="text-sm font-semibold text-slate-100">{formatUsdt(deal.amountMicro)} USDT</span>
                <StatusBadge status={deal.status} />
                <span className="w-28 text-right text-xs text-slate-500">{formatDate(deal.createdAt)}</span>
                {deal.status === "AWAITING_PAYMENT" && env.walletProvider === "mock" && (
                  <form action={simulatePaymentAction}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <SubmitButton className="btn btn-ghost">Mark as paid</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
