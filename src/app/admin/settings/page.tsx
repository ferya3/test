import { getSettings } from "@/lib/deals";
import { formatUsdt } from "@/lib/money";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";

export const metadata = { title: "Platform settings" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
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
          paymentWindowMins={settings.paymentWindowMins}
          requiredConfirmations={settings.requiredConfirmations}
        />
      </Card>

      <Card title="Audit trail" description="Most recent 40 entries.">
        <ul className="divide-y divide-slate-800 text-sm">
          {auditLogs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-mono text-xs text-emerald-300">{log.action}</span>
              <span className="text-xs text-slate-500">
                {log.entity}/{log.entityId.slice(0, 10)}…
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{log.actor?.email ?? "system"}</span>
              <span className="text-xs text-slate-600">{log.ip ?? "—"}</span>
              <span className="w-32 text-right text-xs text-slate-500">{formatDate(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
