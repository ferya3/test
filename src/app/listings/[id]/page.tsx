import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { Alert, Card, Crumb, PageHeader, formatDate } from "@/components/ui";

export const metadata = { title: "Listing" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, listing] = await Promise.all([
    getCurrentUser(),
    prisma.listing.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, displayName: true, createdAt: true } },
        _count: { select: { deals: true } },
      },
    }),
  ]);

  if (!listing || listing.status === "REMOVED") notFound();

  const isOwner = user?.id === listing.sellerId;
  const completedSales = await prisma.deal.count({
    where: { sellerId: listing.sellerId, status: "COMPLETED" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Crumb href="/listings">← Back to marketplace</Crumb>
      <PageHeader
        title={listing.title}
        subtitle={`${listing.category.charAt(0) + listing.category.slice(1).toLowerCase()} · listed ${formatDate(listing.createdAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <Card title="Description">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{listing.description}</p>
        </Card>

        <div className="space-y-4">
          <Card>
            <p className="text-3xl font-semibold text-emerald-300">{formatUsdt(listing.priceMicro)} USDT</p>
            <p className="mt-1 text-sm text-slate-400">Settled through EscrowBridge</p>

            <div className="mt-5">
              {listing.status === "SOLD" ? (
                <Alert tone="info">This listing has already sold.</Alert>
              ) : listing.status === "PAUSED" ? (
                <Alert tone="warn">The seller has paused this listing.</Alert>
              ) : isOwner ? (
                <Alert tone="info">This is your listing. Share the link with buyers.</Alert>
              ) : user ? (
                <Link className="btn btn-primary w-full" href={`/deals/new?listing=${listing.id}`}>
                  Start escrow deal
                </Link>
              ) : (
                <Link className="btn btn-primary w-full" href="/login">
                  Sign in to buy
                </Link>
              )}
            </div>
          </Card>

          <Card title="Seller">
            <p className="font-medium text-slate-200">{listing.seller.displayName}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Member since</dt>
                <dd className="text-slate-300">{formatDate(listing.seller.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Completed sales</dt>
                <dd className="text-slate-300">{completedSales}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
