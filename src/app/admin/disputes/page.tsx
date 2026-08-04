import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { Card, Empty, PageHeader, formatDate } from "@/components/ui";
import { ResolveDisputeForm } from "@/components/resolve-dispute-form";

export const metadata = { title: "Disputes" };

export default async function AdminDisputesPage() {
  const disputes = await prisma.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      openedBy: { select: { displayName: true, email: true } },
      deal: {
        include: {
          buyer: { select: { email: true } },
          seller: { select: { email: true, payoutAddress: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { displayName: true } } } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Disputes" subtitle="Read the thread, then release to the seller or refund the buyer." />

      {disputes.length === 0 ? (
        <Card>
          <Empty title="No disputes" />
        </Card>
      ) : (
        disputes.map((dispute) => (
          <Card
            key={dispute.id}
            title={dispute.deal.title}
            description={`${dispute.deal.reference} · ${formatUsdt(dispute.deal.amountMicro)} USDT · ${dispute.deal.buyer.email} → ${dispute.deal.seller.email}`}
            action={
              <Link className="text-sm text-emerald-300 hover:underline" href={`/deals/${dispute.dealId}`}>
                Open deal
              </Link>
            }
          >
            <p className="text-xs text-slate-500">
              Raised by {dispute.openedBy.displayName} on {formatDate(dispute.createdAt)} · status {dispute.status}
            </p>
            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-200">
              {dispute.reason}
            </p>

            {dispute.deal.messages.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-slate-400">
                  Message thread ({dispute.deal.messages.length})
                </summary>
                <ul className="mt-3 space-y-2 text-sm">
                  {dispute.deal.messages.map((message) => (
                    <li key={message.id} className="rounded-lg bg-slate-800/50 p-2">
                      <span className="text-xs text-slate-500">
                        {message.sender.displayName} · {formatDate(message.createdAt)}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-slate-200">{message.body}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {dispute.status === "OPEN" ? (
              <div className="mt-5 border-t border-slate-800 pt-5">
                {!dispute.deal.seller.payoutAddress && (
                  <p className="mb-3 text-xs text-amber-300">
                    The seller has no payout address on file — releasing to them will fail until they add one.
                  </p>
                )}
                <ResolveDisputeForm dealId={dispute.dealId} />
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Resolved {formatDate(dispute.resolvedAt)}
                </p>
                <p className="mt-1 text-sm text-slate-200">{dispute.resolution}</p>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
