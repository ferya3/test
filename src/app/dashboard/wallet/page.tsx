import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { getSettings } from "@/lib/deals";
import { LEDGER_LABELS, type LedgerKind } from "@/lib/ledger";
import { WITHDRAWAL_LABELS } from "@/lib/withdrawals";
import { Card, Empty, PageHeader, Stat, formatDate } from "@/components/ui";
import { WithdrawForm } from "@/components/withdraw-form";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard%2Fwallet");

  const [account, entries, withdrawals, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceMicro: true } }),
    prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.withdrawal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getSettings(),
  ]);

  const pending = withdrawals
    .filter((w) => ["REQUESTED", "APPROVED"].includes(w.status))
    .reduce((sum, w) => sum + w.amountMicro, 0n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your wallet"
        subtitle="Money you have on the platform: payouts from sales, refunds, and anything credited to you."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available balance" value={`${formatUsdt(account.balanceMicro)} USDT`} sub="Spendable now" />
        <Stat label="Withdrawals in flight" value={`${formatUsdt(pending)} USDT`} sub="Already off your balance" />
        <Stat label="Minimum withdrawal" value={`${formatUsdt(settings.minWithdrawalMicro)} USDT`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        <Card title="Withdraw" description="Sends your balance to your own USDT address. An operator reviews each request.">
          <WithdrawForm
            balance={formatUsdt(account.balanceMicro)}
            minimum={formatUsdt(settings.minWithdrawalMicro)}
            defaultAddress={user.payoutAddress ?? ""}
            defaultNetwork={user.payoutNetwork}
          />
        </Card>

        <Card title="Withdrawal history">
          {withdrawals.length === 0 ? (
            <Empty title="No withdrawals yet" />
          ) : (
            <ul className="divide-y divide-slate-800">
              {withdrawals.map((withdrawal) => (
                <li key={withdrawal.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-100">
                      {formatUsdt(withdrawal.amountMicro)} USDT
                    </span>
                    <span className="text-xs text-slate-500">
                      {WITHDRAWAL_LABELS[withdrawal.status] ?? withdrawal.status}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">{formatDate(withdrawal.createdAt)}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{withdrawal.toAddress}</p>
                  {withdrawal.note && <p className="mt-1 text-xs text-amber-300">{withdrawal.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Transactions" description="Every movement on your balance.">
        {entries.length === 0 ? (
          <Empty title="Nothing here yet">
            Balance appears when you complete a sale, receive a refund, or an operator credits your account.
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-800">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                  {LEDGER_LABELS[entry.kind as LedgerKind] ?? entry.kind}
                </span>
                <span className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1 text-sm text-slate-400">{entry.note ?? "—"}</span>
                <span
                  className={`text-sm font-semibold ${entry.amountMicro > 0n ? "text-emerald-300" : "text-red-300"}`}
                >
                  {entry.amountMicro > 0n ? "+" : "−"}
                  {formatUsdt(entry.amountMicro < 0n ? -entry.amountMicro : entry.amountMicro)} USDT
                </span>
                <span className="w-24 text-right text-xs text-slate-500">
                  {formatUsdt(entry.balanceAfterMicro)}
                </span>
                <span className="w-28 text-right text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
