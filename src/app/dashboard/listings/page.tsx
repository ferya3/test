import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { setListingStatusAction } from "@/app/actions/deals";
import { Card, Empty, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Your listings" };

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id, status: { not: "REMOVED" } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Your listings"
        action={
          <Link className="btn btn-primary" href="/dashboard/listings/new">
            New listing
          </Link>
        }
      />

      <Card>
        {listings.length === 0 ? (
          <Empty title="You have no listings">Post one so buyers can find you, or send a buyer a deal link directly.</Empty>
        ) : (
          <ul className="divide-y divide-slate-800">
            {listings.map((listing) => (
              <li key={listing.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/listings/${listing.id}`} className="min-w-0 flex-1 truncate font-medium text-slate-200 hover:text-emerald-300">
                  {listing.title}
                </Link>
                <span className="text-sm font-semibold text-slate-100">{formatUsdt(listing.priceMicro)} USDT</span>
                <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">{listing.status}</span>
                <span className="w-28 text-right text-xs text-slate-500">{formatDate(listing.createdAt)}</span>

                {listing.status !== "SOLD" && (
                  <div className="flex gap-2">
                    <form action={setListingStatusAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="status" value={listing.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                      <SubmitButton className="btn btn-ghost">
                        {listing.status === "ACTIVE" ? "Pause" : "Activate"}
                      </SubmitButton>
                    </form>
                    <form action={setListingStatusAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="status" value="REMOVED" />
                      <SubmitButton className="btn btn-ghost" confirm="Remove this listing?">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
