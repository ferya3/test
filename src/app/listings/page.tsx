import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { CATEGORIES } from "@/lib/validation";
import { Card, Empty, PageHeader, formatDate } from "@/components/ui";

export const metadata = { title: "Marketplace" };

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;

  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      ...(category && CATEGORIES.includes(category as (typeof CATEGORIES)[number]) ? { category } : {}),
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { seller: { select: { displayName: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle="Listings from sellers who agree to settle through escrow."
        action={
          <Link className="btn btn-ghost" href="/dashboard/listings/new">
            Post a listing
          </Link>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2" action="/listings">
        <input
          name="q"
          className="input max-w-xs"
          placeholder="Search listings…"
          defaultValue={q ?? ""}
          aria-label="Search listings"
        />
        <select name="category" className="select max-w-[12rem]" defaultValue={category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item.charAt(0) + item.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost" type="submit">
          Filter
        </button>
      </form>

      {listings.length === 0 ? (
        <Card>
          <Empty title="No listings match that search">Try a different category, or post your own listing.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Link key={listing.id} href={`/listings/${listing.id}`} className="card p-5 transition hover:border-emerald-500/40">
              <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                {listing.category.charAt(0) + listing.category.slice(1).toLowerCase()}
              </span>
              <h2 className="mt-3 line-clamp-2 font-semibold text-slate-100">{listing.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-slate-400">{listing.description}</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                <span className="text-lg font-semibold text-emerald-300">{formatUsdt(listing.priceMicro)} USDT</span>
                <span className="text-xs text-slate-500">{listing.seller.displayName}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-600">Listed {formatDate(listing.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
