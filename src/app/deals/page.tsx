import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { Card, Empty, PageHeader, StatusBadge, formatDate } from "@/components/ui";

export const metadata = { title: "Deals" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "buying", label: "Buying" },
  { key: "selling", label: "Selling" },
  { key: "open", label: "Open" },
] as const;

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { filter = "all" } = await searchParams;
  const mine = { OR: [{ buyerId: user.id }, { sellerId: user.id }] };
  const where =
    filter === "buying"
      ? { buyerId: user.id }
      : filter === "selling"
        ? { sellerId: user.id }
        : filter === "open"
          ? { AND: [mine, { status: { in: ["AWAITING_PAYMENT", "FUNDED", "DELIVERED", "DISPUTED"] } }] }
          : mine;

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { buyer: { select: { displayName: true } }, seller: { select: { displayName: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Your deals"
        action={
          <Link className="btn btn-primary" href="/deals/new">
            Start a deal
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/deals?filter=${option.key}`}
            className={`badge ${
              filter === option.key
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-800/40 text-slate-400"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card>
        {deals.length === 0 ? (
          <Empty title="Nothing here yet">Deals you open or receive will show up in this list.</Empty>
        ) : (
          <ul className="divide-y divide-slate-800">
            {deals.map((deal) => (
              <li key={deal.id}>
                <Link href={`/deals/${deal.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-90">
                  <span className="font-mono text-xs text-slate-500">{deal.reference}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{deal.title}</span>
                  <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                    {deal.buyerId === user.id ? "Buying" : "Selling"}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">{formatUsdt(deal.amountMicro)} USDT</span>
                  <StatusBadge status={deal.status} />
                  <span className="w-28 text-right text-xs text-slate-500">{formatDate(deal.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
