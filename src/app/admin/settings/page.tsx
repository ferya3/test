import { getSettings } from "@/lib/deals";
import { listTreasuryWallets } from "@/lib/treasury";
import { TreasuryWalletsForm } from "@/components/treasury-wallets-form";
import { formatUsdt } from "@/lib/money";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { CompanyDetailsForm } from "@/components/company-details-form";
import { Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";

export const metadata = { title: "Platform settings" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  const wallets = await listTreasuryWallets();
  const auditLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Platform settings" />

      <Card title="Escrow rules">
        <PlatformSettingsForm
          feeBasisPoints={settings.feeBasisPoints}
          minDeal={formatUsdt(settings.minDealMicro)}
          maxDeal={formatUsdt(settings.maxDealMicro)}
          minWithdrawal={formatUsdt(settings.minWithdrawalMicro)}
          paymentWindowMins={settings.paymentWindowMins}
          requiredConfirmations={settings.requiredConfirmations}
          showcaseUsers={settings.showcaseUsers}
          showcaseDeals={settings.showcaseDeals}
        />
      </Card>

      <Card
        title="Company details"
        description="Printed on invoices and shown on the imprint page. These have to be genuine — an address you cannot receive post at is worse than leaving it blank."
      >
        <CompanyDetailsForm
          companyName={settings.companyName}
          companyStreet={settings.companyStreet}
          companyPostalCode={settings.companyPostalCode}
          companyCity={settings.companyCity}
          companyCountry={settings.companyCountry}
          companyEmail={settings.companyEmail}
          companyRegistration={settings.companyRegistration}
        />
      </Card>

      <Card
        title="Receiving wallets"
        description="Where buyers send their USDT. Set an address for a network to accept deposits on it; clear it to fall back to per-deal derived addresses."
      >
        <TreasuryWalletsForm
          wallets={wallets.map((wallet) => ({
            network: wallet.network,
            label: wallet.label,
            address: wallet.address,
            note: wallet.note,
          }))}
        />
        <p className="mt-4 text-xs text-slate-500">
          A shared address cannot be matched to a deal automatically — every buyer sends to the same place. Deposits
          against these addresses are credited by hand from the user&apos;s page.
        </p>
      </Card>

      <Card title="Audit trail" description="Most recent 40 entries.">
        <ul className="divide-y divide-slate-800 text-sm">
          {auditLogs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-mono text-xs text-emerald-300">{log.action}</span>
              <span className="text-xs text-slate-500">
                {log.entity}/{log.entityId.slice(0, 10)}…
              </span>
              <span className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1 text-xs text-slate-500">{log.actor?.email ?? "system"}</span>
              <span className="text-xs text-slate-600">{log.ip ?? "—"}</span>
              <span className="w-32 text-right text-xs text-slate-500">{formatDate(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
