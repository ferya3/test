import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatUsdt } from "@/lib/money";
import { LEDGER_LABELS, type LedgerKind } from "@/lib/ledger";
import { WITHDRAWAL_LABELS } from "@/lib/withdrawals";
import { explorerAddressUrl, type Network } from "@/lib/wallet";
import { setUserBlockedAction, setUserRoleAction, revokeSessionsAction } from "@/app/actions/admin";
import { Card, Crumb, Empty, PageHeader, Stat, StatusBadge, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AdjustBalanceForm } from "@/components/adjust-balance-form";
import { AdminSetPasswordForm } from "@/components/password-forms";

export const metadata = { title: "User" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: { select: { buyerDeals: true, sellerDeals: true, listings: true } },
      ledgerEntries: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { email: true } } },
      },
      withdrawals: { orderBy: { createdAt: "desc" }, take: 20 },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } },
    },
  });
  if (!user) notFound();

  const deals = await prisma.deal.findMany({
    where: { OR: [{ buyerId: id }, { sellerId: id }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const isSelf = admin?.id === user.id;
  const traded = await prisma.deal.aggregate({
    where: { OR: [{ buyerId: id }, { sellerId: id }], status: "COMPLETED" },
    _sum: { amountMicro: true },
  });

  return (
    <div className="space-y-6">
      <Crumb href="/admin/users">← All users</Crumb>
      <PageHeader
        title={user.displayName}
        subtitle={user.email}
        action={
          <div className="flex flex-wrap gap-2">
            {user.role === "ADMIN" && (
              <span className="badge border-amber-500/40 bg-amber-500/10 text-amber-200">Admin</span>
            )}
            {user.isBlocked && (
              <span className="badge border-red-500/40 bg-red-500/10 text-red-200">Blocked</span>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Balance" value={`${formatUsdt(user.balanceMicro)} USDT`} sub="Spendable now" />
        <Stat label="Deals" value={`${user._count.buyerDeals} / ${user._count.sellerDeals}`} sub="bought / sold" />
        <Stat label="Completed volume" value={`${formatUsdt(traded._sum.amountMicro ?? 0n)} USDT`} />
        <Stat label="Active sessions" value={user.sessions.length} sub={`Joined ${formatDate(user.createdAt)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card
            title="Adjust balance"
            description="Use this when money moved outside the normal flow — for example a buyer who sent USDT straight to the treasury wallet instead of a deal's deposit address."
          >
            <AdjustBalanceForm userId={user.id} currentBalance={formatUsdt(user.balanceMicro)} />
          </Card>

          <Card
            title="Reset password"
            description="For the support case where a user has lost access. They are signed out everywhere and must be told the new password over a channel you trust."
          >
            <AdminSetPasswordForm userId={user.id} email={user.email} />
          </Card>

          <Card title="Ledger" description="Every movement on this balance, newest first.">
            {user.ledgerEntries.length === 0 ? (
              <Empty title="No movements yet" />
            ) : (
              <ul className="divide-y divide-slate-800">
                {user.ledgerEntries.map((entry) => (
                  <li key={entry.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                        {LEDGER_LABELS[entry.kind as LedgerKind] ?? entry.kind}
                      </span>
                      <span
                        className={`min-w-24 text-sm font-semibold ${
                          entry.amountMicro > 0n ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {entry.amountMicro > 0n ? "+" : "−"}
                        {formatUsdt(entry.amountMicro < 0n ? -entry.amountMicro : entry.amountMicro)} USDT
                      </span>
                      <span className="text-xs text-slate-500">
                        balance {formatUsdt(entry.balanceAfterMicro)}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                    </div>
                    {entry.note && <p className="mt-1 text-sm text-slate-400">{entry.note}</p>}
                    <p className="mt-1 text-[11px] text-slate-600">
                      {entry.dealId && (
                        <Link href={`/deals/${entry.dealId}`} className="text-emerald-400 hover:underline">
                          {entry.reference ?? entry.dealId}
                        </Link>
                      )}
                      {!entry.dealId && entry.reference && <span className="font-mono">{entry.reference}</span>}
                      {entry.actor && <span className="ml-2">by {entry.actor.email}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Deals">
            {deals.length === 0 ? (
              <Empty title="No deals yet" />
            ) : (
              <ul className="divide-y divide-slate-800">
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <Link href={`/deals/${deal.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:opacity-90">
                      <span className="font-mono text-xs text-emerald-300">{deal.reference}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{deal.title}</span>
                      <span className="badge border-slate-700 bg-slate-800/40 text-slate-400">
                        {deal.buyerId === user.id ? "Buying" : "Selling"}
                      </span>
                      <span className="text-sm font-semibold text-slate-100">
                        {formatUsdt(deal.amountMicro)} USDT
                      </span>
                      <StatusBadge status={deal.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Account actions">
            {isSelf ? (
              <p className="text-sm text-slate-500">
                This is your own account. Blocking and role changes are disabled here so you cannot lock yourself out.
              </p>
            ) : (
              <div className="space-y-3">
                <form action={setUserRoleAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="role" value={user.role === "ADMIN" ? "USER" : "ADMIN"} />
                  <SubmitButton
                    className="btn btn-ghost w-full"
                    confirm={
                      user.role === "ADMIN"
                        ? "Remove administrator access from this account?"
                        : "Give this account full administrator access, including dispute resolution and balance adjustments?"
                    }
                  >
                    {user.role === "ADMIN" ? "Remove admin access" : "Make administrator"}
                  </SubmitButton>
                </form>

                <form action={setUserBlockedAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="blocked" value={String(!user.isBlocked)} />
                  <SubmitButton
                    className={`w-full btn ${user.isBlocked ? "btn-ghost" : "btn-danger"}`}
                    confirm={
                      user.isBlocked
                        ? "Restore access for this account?"
                        : "Block this account? They will be signed out immediately."
                    }
                  >
                    {user.isBlocked ? "Unblock account" : "Block account"}
                  </SubmitButton>
                </form>

                <form action={revokeSessionsAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <SubmitButton
                    className="btn btn-ghost w-full"
                    confirm="Sign this user out of every device?"
                  >
                    Revoke all sessions ({user.sessions.length})
                  </SubmitButton>
                </form>
              </div>
            )}
          </Card>

          <Card title="Payout address">
            {user.payoutAddress ? (
              <>
                <p className="text-xs text-slate-500">{user.payoutNetwork}</p>
                <a
                  className="mt-1 block break-all font-mono text-[11px] text-slate-300 hover:text-emerald-300"
                  href={explorerAddressUrl(user.payoutNetwork as Network, user.payoutAddress)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {user.payoutAddress}
                </a>
              </>
            ) : (
              <p className="text-sm text-slate-500">Not set. They cannot withdraw until they add one.</p>
            )}
          </Card>

          <Card title="Withdrawals">
            {user.withdrawals.length === 0 ? (
              <Empty title="None requested" />
            ) : (
              <ul className="space-y-3 text-sm">
                {user.withdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-200">
                        {formatUsdt(withdrawal.amountMicro)} USDT
                      </span>
                      <span className="text-xs text-slate-500">
                        {WITHDRAWAL_LABELS[withdrawal.status] ?? withdrawal.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{withdrawal.toAddress}</p>
                    <p className="text-[11px] text-slate-600">{formatDate(withdrawal.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
