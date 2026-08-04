import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { OPEN_STATUSES } from "@/lib/deals";
import { Card, Empty, PageHeader, Stat, StatusBadge, formatDate } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [deals, openBuying, openSelling, earned] = await Promise.all([
    prisma.deal.findMany({
      where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { buyer: { select: { displayName: true } }, seller: { select: { displayName: true } } },
    }),
    prisma.deal.count({ where: { buyerId: user.id, status: { in: OPEN_STATUSES } } }),
    prisma.deal.count({ where: { sellerId: user.id, status: { in: OPEN_STATUSES } } }),
    prisma.deal.aggregate({
      where: { sellerId: user.id, status: "COMPLETED" },
      _sum: { payoutMicro: true },
    }),
  ]);

  const account = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { balanceMicro: true },
  });

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.displayName}`}
        subtitle="Everything you are buying and selling through escrow."
        action={
          <div className="flex gap-2">
            <Link className="btn btn-ghost" href="/dashboard/wallet">
              Wallet
            </Link>
            <Link className="btn btn-ghost" href="/dashboard/listings/new">
              New listing
            </Link>
            <Link className="btn btn-primary" href="/deals/new">
              Start a deal
            </Link>
          </div>
        }
      />

      {!user.payoutAddress && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          You have not set a payout address yet. Deals you sell cannot be paid out until you do —{" "}
          <Link href="/dashboard/settings" className="font-semibold underline">
            add one now
          </Link>
          .
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Open purchases" value={openBuying} />
        <Stat label="Open sales" value={openSelling} />
        <Stat label="Earned as seller" value={`${formatUsdt(earned._sum.payoutMicro ?? 0n)} USDT`} sub="After fees" />
        <Stat label="Wallet balance" value={`${formatUsdt(account.balanceMicro)} USDT`} sub="Spendable now" />
      </div>

      <Card title="Recent deals" action={<Link className="text-sm text-emerald-300 hover:underline" href="/deals">View all</Link>}>
        {deals.length === 0 ? (
          <Empty title="No deals yet">
            Start one from a marketplace listing, or invite a seller directly by their account email.
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-800">
            {deals.map((deal) => {
              const isBuyer = deal.buyerId === user.id;
              return (
                <li key={deal.id}>
                  <Link href={`/deals/${deal.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-90">
                    <span className="font-mono text-xs text-slate-500">{deal.reference}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{deal.title}</span>
                    <span className="text-xs text-slate-500">
                      {isBuyer ? `from ${deal.seller.displayName}` : `to ${deal.buyer.displayName}`}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{formatUsdt(deal.amountMicro)} USDT</span>
                    <StatusBadge status={deal.status} />
                    <span className="w-28 text-right text-xs text-slate-500">{formatDate(deal.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
