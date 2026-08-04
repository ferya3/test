import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NewListingForm } from "@/components/new-listing-form";
import { Card, Crumb, PageHeader } from "@/components/ui";

export const metadata = { title: "New listing" };

export default async function NewListingPage() {
  if (!(await getCurrentUser())) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl">
      <Crumb href="/dashboard/listings">← Your listings</Crumb>
      <PageHeader
        title="Post a listing"
        subtitle="Buyers open an escrow deal straight from your listing, with the terms pre-filled."
      />
      <Card>
        <NewListingForm />
      </Card>
    </div>
  );
}
