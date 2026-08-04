import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { getSettings } from "@/lib/deals";
import { NewDealForm } from "@/components/new-deal-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Start a deal" };

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { listing: listingId } = await searchParams;
  const settings = await getSettings();

  const listing = listingId
    ? await prisma.listing.findUnique({
        where: { id: listingId },
        include: { seller: { select: { email: true, id: true } } },
      })
    : null;

  // Pre-filling from someone else's listing is fine; from your own it is not a deal.
  const prefill =
    listing && listing.status === "ACTIVE" && listing.seller.id !== user.id
      ? {
          listingId: listing.id,
          sellerEmail: listing.seller.email,
          title: listing.title,
          description: listing.description,
          amount: formatUsdt(listing.priceMicro),
        }
      : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Start an escrow deal"
        subtitle="Set the terms with the seller. Nothing is charged until you send the USDT."
      />
      <Card>
        <NewDealForm
          prefill={prefill}
          feePercent={settings.feeBasisPoints / 100}
          minAmount={formatUsdt(settings.minDealMicro)}
          maxAmount={formatUsdt(settings.maxDealMicro)}
          defaultRefundAddress={user.payoutNetwork === "TRON" ? (user.payoutAddress ?? "") : ""}
        />
      </Card>
    </div>
  );
}
