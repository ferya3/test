import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PayoutAddressForm } from "@/components/payout-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Account settings" />

      <Card title="Account">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Display name</dt>
            <dd className="text-slate-200">{user.displayName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-200">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-200">{user.role}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Payout address"
        description="Where your USDT is sent when a buyer releases escrow. Double-check it — transfers cannot be reversed."
      >
        <PayoutAddressForm
          defaultAddress={user.payoutAddress ?? ""}
          defaultNetwork={user.payoutNetwork}
        />
      </Card>
    </div>
  );
}
