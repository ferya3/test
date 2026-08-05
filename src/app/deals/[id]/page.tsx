import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { isParticipant, buyerMayReveal, mayCancel, mayDispute, mayRelease, sellerMayDeliver } from "@/lib/deals";
import { getTreasuryAddress } from "@/lib/treasury";
import { explorerAddressUrl, explorerTxUrl, networkLabel, type Network } from "@/lib/wallet";
import { Alert, Card, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { LEDGER_LABELS, type LedgerKind } from "@/lib/ledger";
import { FundFromBalance } from "@/components/fund-from-balance";
import { SubmitButton } from "@/components/submit-button";
import { PaymentPanel } from "@/components/payment-panel";
import { DeliveryForm } from "@/components/delivery-form";
import { CredentialVault } from "@/components/credential-vault";
import { DealChat } from "@/components/deal-chat";
import { DisputeForm } from "@/components/dispute-form";
import { cancelDealAction, releaseAction } from "@/app/actions/deals";

export const metadata = { title: "Deal" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, displayName: true, email: true, balanceMicro: true } },
      seller: { select: { id: true, displayName: true, email: true, payoutAddress: true } },
      credentials: { orderBy: { createdAt: "asc" } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { seenAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { displayName: true } } } },
      dispute: { include: { openedBy: { select: { displayName: true } } } },
    },
  });

  if (!deal || !isParticipant(deal, user)) notFound();

  // When the operator has published an address for this network, that is where
  // buyers send; the derived per-deal address is the fallback.
  const treasuryAddress = await getTreasuryAddress(deal.network as Network);
  const depositAddress = treasuryAddress ?? deal.depositAddress;

  const isBuyer = deal.buyerId === user.id;
  const isSeller = deal.sellerId === user.id;
  const network = deal.network as Network;
  const canReveal = buyerMayReveal(deal, user.id);
  const rejectedCount = deal.credentials.filter((item) => item.rejectedAt).length;
  const outstanding = deal.credentials.filter((item) => !item.confirmedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={deal.title}
        subtitle={`Reference ${deal.reference} · opened ${formatDate(deal.createdAt)}`}
        action={<StatusBadge status={deal.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card title="Agreement">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{deal.description}</p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Buyer</dt>
                <dd className="text-sm text-slate-200">
                  {deal.buyer.displayName}
                  {isBuyer && <span className="ml-1 text-xs text-emerald-400">(you)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Seller</dt>
                <dd className="text-sm text-slate-200">
                  {deal.seller.displayName}
                  {isSeller && <span className="ml-1 text-xs text-emerald-400">(you)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Inspection window</dt>
                <dd className="text-sm text-slate-200">{deal.inspectionHours} hours after delivery</dd>
              </div>
            </dl>
          </Card>

          {deal.status === "AWAITING_PAYMENT" && depositAddress && (
            <PaymentPanel
              amount={formatUsdt(deal.amountMicro)}
              address={depositAddress!}
              shared={Boolean(treasuryAddress)}
              reference={deal.reference}
              network={network}
              expiresAt={deal.expiresAt.toISOString()}
              isBuyer={isBuyer}
            />
          )}

          {isBuyer && deal.status === "AWAITING_PAYMENT" && (
            <FundFromBalance
              dealId={deal.id}
              balance={formatUsdt(deal.buyer.balanceMicro)}
              amount={formatUsdt(deal.amountMicro)}
              sufficient={deal.buyer.balanceMicro >= deal.amountMicro}
            />
          )}

          {isSeller && sellerMayDeliver(deal) && <DeliveryForm dealId={deal.id} />}

          {isSeller && deal.status === "FUNDED" && !deal.seller.payoutAddress && (
            <Alert tone="warn">
              Your payout will land on your platform balance. Add a payout address in{" "}
              <Link href="/dashboard/settings" className="underline">
                settings
              </Link>{" "}
              so you can withdraw it afterwards.
            </Alert>
          )}

          {deal.credentials.length > 0 && (
            <CredentialVault
              credentials={deal.credentials.map((credential) => ({
                id: credential.id,
                label: credential.label,
                kind: credential.kind,
                revealCount: credential.revealCount,
                purged: Boolean(credential.purgedAt),
                confirmed: Boolean(credential.confirmedAt),
                rejected: Boolean(credential.rejectedAt),
                rejectedNote: credential.rejectedNote,
              }))}
              canReveal={canReveal}
              canConfirm={isBuyer && ["DELIVERED", "DISPUTED"].includes(deal.status)}
              lockedReason={
                isSeller
                  ? "You submitted these. For safety they are write-only — only the buyer can read them back."
                  : "These unlock once the seller delivers on a funded deal."
              }
            />
          )}

          {isBuyer && mayRelease(deal) && (
            <Card
              title="Finished checking?"
              description={`Releasing credits ${formatUsdt(deal.payoutMicro)} USDT to the seller's balance. This cannot be undone.`}
            >
              {outstanding > 0 && (
                <div className="mb-4">
                  <Alert tone="warn">
                    {outstanding} of {deal.credentials.length} items in the vault are still unconfirmed
                    {rejectedCount > 0 && `, and ${rejectedCount} you marked as not working`}. Releasing now pays the
                    seller in full for everything, including whatever has not arrived.
                  </Alert>
                </div>
              )}
              <form action={releaseAction} className="flex flex-wrap gap-3">
                <input type="hidden" name="dealId" value={deal.id} />
                <SubmitButton
                  pendingLabel="Releasing…"
                  confirm={
                    outstanding > 0
                      ? `${outstanding} item(s) are still unconfirmed. Release the full amount to the seller anyway?`
                      : "Release the escrowed funds to the seller? This cannot be undone."
                  }
                >
                  Release funds to seller
                </SubmitButton>
              </form>
              {deal.inspectionEndsAt && (
                <p className="mt-3 text-xs text-slate-500">
                  If you do nothing, funds release automatically on {formatDate(deal.inspectionEndsAt)}.
                </p>
              )}
            </Card>
          )}

          {deal.dispute && (
            <Card title="Dispute">
              <p className="text-sm text-slate-400">
                Opened by {deal.dispute.openedBy.displayName} on {formatDate(deal.dispute.createdAt)}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{deal.dispute.reason}</p>
              {deal.dispute.resolution && (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Moderator decision</p>
                  <p className="mt-1 text-sm text-slate-200">{deal.dispute.resolution}</p>
                </div>
              )}
            </Card>
          )}

          {!deal.dispute && mayDispute(deal) && (isBuyer || isSeller) && <DisputeForm dealId={deal.id} />}

          <DealChat
            dealId={deal.id}
            currentUserId={user.id}
            messages={deal.messages.map((message) => ({
              id: message.id,
              body: message.body,
              senderId: message.senderId,
              senderName: message.sender.displayName,
              isStaff: message.isStaff,
              createdAt: message.createdAt.toISOString(),
            }))}
          />
        </div>

        <div className="space-y-6">
          <Card title="Escrow">
            <dl className="space-y-3 text-sm">
              <Row label="Sale price" value={`${formatUsdt(deal.payoutMicro)} USDT`} />
              <Row label="Platform fee" value={`+ ${formatUsdt(deal.feeMicro)} USDT`} />
              <Row label="Buyer funds" value={`${formatUsdt(deal.amountMicro)} USDT`} strong />
              <Row label="Seller receives" value={`${formatUsdt(deal.payoutMicro)} USDT`} strong />
              <Row label="Network" value={networkLabel(network)} />
            </dl>
            {depositAddress && (
            <div className="mt-4 border-t border-slate-800 pt-4 text-xs text-slate-500">
              <p className="mb-1">Deposit address</p>
              <a
                className="break-all font-mono text-[11px] text-slate-300 hover:text-emerald-300"
                href={explorerAddressUrl(network, depositAddress ?? "")}
                target="_blank"
                rel="noreferrer noopener"
              >
                {depositAddress}
              </a>
            </div>
            )}
          </Card>

          <Card title="Timeline">
            <ul className="space-y-2 text-sm">
              <TimelineRow label="Opened" at={deal.createdAt} />
              <TimelineRow label="Funded" at={deal.fundedAt} />
              <TimelineRow label="Delivered" at={deal.deliveredAt} />
              <TimelineRow label="Inspection ends" at={deal.inspectionEndsAt} />
              <TimelineRow label="Completed" at={deal.completedAt} />
              <TimelineRow label="Refunded" at={deal.refundedAt} />
              <TimelineRow label="Cancelled" at={deal.cancelledAt} />
            </ul>
          </Card>

          {deal.payments.length > 0 && (
            <Card title="On-chain payments">
              <ul className="space-y-3 text-sm">
                {deal.payments.map((payment) => (
                  <li key={payment.id} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-200">{formatUsdt(payment.amountMicro)} USDT</span>
                      <span className="text-xs text-slate-500">{payment.status}</span>
                    </div>
                    <a
                      className="mt-1 block truncate font-mono text-[11px] text-slate-500 hover:text-emerald-300"
                      href={explorerTxUrl(payment.network as Network, payment.txHash)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {payment.txHash}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {deal.ledgerEntries.length > 0 && (
            <Card title="Settlement">
              <ul className="space-y-3 text-sm">
                {deal.ledgerEntries.map((entry) => (
                  <li key={entry.id} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">
                        {LEDGER_LABELS[entry.kind as LedgerKind] ?? entry.kind}
                      </span>
                      <span
                        className={`font-semibold ${entry.amountMicro > 0n ? "text-emerald-300" : "text-slate-300"}`}
                      >
                        {entry.amountMicro > 0n ? "+" : "−"}
                        {formatUsdt(entry.amountMicro < 0n ? -entry.amountMicro : entry.amountMicro)} USDT
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{formatDate(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Settled amounts move to the recipient's platform balance, which they withdraw from their wallet.
              </p>
            </Card>
          )}

          {isBuyer && mayCancel(deal) && (
            <form action={cancelDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <SubmitButton
                className="btn btn-ghost w-full"
                pendingLabel="Cancelling…"
                confirm="Cancel this deal? Only do this if you have not sent any USDT."
              >
                Cancel deal
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "font-semibold text-slate-100" : "text-slate-300"}>{value}</dd>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: Date | null }) {
  if (!at) return null;
  return (
    <li className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{formatDate(at)}</span>
    </li>
  );
}
