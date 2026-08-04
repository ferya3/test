import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { explorerAddressUrl, type Network } from "@/lib/wallet";
import { markTransferSentAction, purgeCredentialsAction } from "@/app/actions/admin";
import { Alert, Card, Empty, PageHeader, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Treasury" };

export default async function TreasuryPage() {
  const [payouts, refunds, purgeable] = await Promise.all([
    prisma.payout.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 100,
      include: { deal: { select: { id: true, reference: true, title: true } } },
    }),
    prisma.refund.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 100,
      include: { deal: { select: { id: true, reference: true, title: true } } },
    }),
    prisma.deal.findMany({
      where: {
        status: { in: ["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED"] },
        credentials: { some: { purgedAt: null } },
      },
      select: { id: true, reference: true, title: true, completedAt: true, _count: { select: { credentials: true } } },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treasury"
        subtitle="Outgoing transfers are broadcast from the offline wallet, then recorded here."
      />

      <Alert tone="info">
        The web server holds no private keys. Send each transfer from the treasury wallet yourself, then paste the
        transaction hash to close it out.
      </Alert>

      <TransferTable
        title="Seller payouts"
        kind="payout"
        rows={payouts.map((payout) => ({
          id: payout.id,
          dealId: payout.deal.id,
          reference: payout.deal.reference,
          title: payout.deal.title,
          toAddress: payout.toAddress,
          network: payout.network as Network,
          amountMicro: payout.amountMicro,
          status: payout.status,
          txHash: payout.txHash,
          createdAt: payout.createdAt,
        }))}
      />

      <TransferTable
        title="Buyer refunds"
        kind="refund"
        rows={refunds.map((refund) => ({
          id: refund.id,
          dealId: refund.deal.id,
          reference: refund.deal.reference,
          title: refund.deal.title,
          toAddress: refund.toAddress,
          network: refund.network as Network,
          amountMicro: refund.amountMicro,
          status: refund.status,
          txHash: refund.txHash,
          createdAt: refund.createdAt,
        }))}
      />

      <Card
        title="Credentials pending purge"
        description="Settled deals still holding secrets. Purging is irreversible and keeps the blast radius of a breach small."
      >
        {purgeable.length === 0 ? (
          <Empty title="Nothing to purge" />
        ) : (
          <ul className="divide-y divide-slate-800">
            {purgeable.map((deal) => (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/deals/${deal.id}`} className="font-mono text-xs text-emerald-300 hover:underline">
                  {deal.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{deal.title}</span>
                <span className="text-xs text-slate-500">{deal._count.credentials} items</span>
                <span className="text-xs text-slate-500">{formatDate(deal.completedAt)}</span>
                <form action={purgeCredentialsAction}>
                  <input type="hidden" name="dealId" value={deal.id} />
                  <SubmitButton
                    className="btn btn-danger"
                    confirm="Permanently destroy the stored credentials for this deal?"
                  >
                    Purge
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type TransferRow = {
  id: string;
  dealId: string;
  reference: string;
  title: string;
  toAddress: string;
  network: Network;
  amountMicro: bigint;
  status: string;
  txHash: string | null;
  createdAt: Date;
};

function TransferTable({ title, kind, rows }: { title: string; kind: "payout" | "refund"; rows: TransferRow[] }) {
  const queued = rows.filter((row) => row.status === "QUEUED");

  return (
    <Card title={title} description={`${queued.length} queued of ${rows.length} total`}>
      {rows.length === 0 ? (
        <Empty title={`No ${kind}s yet`} />
      ) : (
        <ul className="divide-y divide-slate-800">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/deals/${row.dealId}`} className="font-mono text-xs text-emerald-300 hover:underline">
                  {row.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{row.title}</span>
                <span className="text-sm font-semibold text-slate-100">{formatUsdt(row.amountMicro)} USDT</span>
                <span
                  className={`badge ${
                    row.status === "QUEUED"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {row.status}
                </span>
                <span className="w-28 text-right text-xs text-slate-500">{formatDate(row.createdAt)}</span>
              </div>

              <a
                className="mt-1 block break-all font-mono text-[11px] text-slate-500 hover:text-emerald-300"
                href={explorerAddressUrl(row.network, row.toAddress)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {row.toAddress}
              </a>

              {row.status === "QUEUED" ? (
                <form action={markTransferSentAction} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <input
                    name="txHash"
                    className="input max-w-md font-mono text-xs"
                    placeholder="Transaction hash"
                    required
                    aria-label="Transaction hash"
                  />
                  <SubmitButton className="btn btn-ghost">Mark sent</SubmitButton>
                </form>
              ) : (
                row.txHash && <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{row.txHash}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
