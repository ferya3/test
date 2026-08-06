import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatUsdtFixed } from "@/lib/money";
import { getSettings, isParticipant } from "@/lib/deals";
import { STATUS_LABELS, type DealStatus } from "@/lib/deal-status";
import { networkLabel, networkShort, type Network } from "@/lib/networks";
import { formatDateTime } from "@/lib/time";
import { PrintButton } from "@/components/print-button";
import { Alert } from "@/components/ui";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/deals/${id}/invoice`)}`);

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, displayName: true, email: true } },
      seller: { select: { id: true, displayName: true, email: true } },
      credentials: { orderBy: { createdAt: "asc" } },
      items: { orderBy: { position: "asc" } },
      payments: { where: { status: "CONFIRMED" }, orderBy: { seenAt: "asc" } },
    },
  });

  if (!deal || !isParticipant(deal, user)) notFound();

  const settings = await getSettings();
  const network = deal.network as Network;
  const feePercent = (settings.feeBasisPoints / 100).toFixed(2).replace(/\.00$/, "");

  // The invoice is only meaningful once the buyer has actually paid, so it is
  // dated from the funding rather than from whenever the page is opened.
  const issuedAt = deal.fundedAt ?? deal.createdAt;
  const paid = Boolean(deal.fundedAt);

  const addressLines = [
    settings.companyName,
    settings.companyStreet,
    [settings.companyPostalCode, settings.companyCity].filter(Boolean).join(" "),
    settings.companyCountry,
  ].filter((line) => line.trim().length > 0);
  const addressIncomplete = !settings.companyStreet.trim() || !settings.companyPostalCode.trim();

  // createDeal enforces all-or-nothing pricing, so the first item decides.
  const itemsArePriced = deal.items.length > 0 && deal.items[0].amountMicro != null;

  const confirmed = deal.credentials.filter((item) => item.confirmedAt).length;
  const rejected = deal.credentials.filter((item) => item.rejectedAt).length;

  return (
    <div className="invoice-page mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/deals/${deal.id}`} className="text-sm text-slate-400 hover:text-emerald-300">
          ← Back to the deal
        </Link>
        <div className="ml-auto flex gap-2">
          <PrintButton />
        </div>
      </div>

      {user.role === "ADMIN" && addressIncomplete && (
        <div className="print:hidden">
          <Alert tone="warn">
            Your street and postal code are not set, so this invoice carries an incomplete address. Fill them in
            under{" "}
            <Link className="underline" href="/admin/settings">
              Admin → Settings
            </Link>
            .
          </Alert>
        </div>
      )}

      <article className="invoice-sheet">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-300 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Invoice</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{settings.companyName}</h1>
            <address className="mt-2 text-sm not-italic leading-relaxed text-slate-600">
              {addressLines.slice(1).map((line) => (
                <div key={line}>{line}</div>
              ))}
              {settings.companyEmail && <div>{settings.companyEmail}</div>}
              {settings.companyRegistration && <div>{settings.companyRegistration}</div>}
            </address>
          </div>

          <dl className="text-sm text-slate-600">
            <div className="flex gap-3">
              <dt className="w-28 text-slate-500">Invoice no.</dt>
              <dd className="font-mono font-semibold text-slate-900">{deal.reference}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-slate-500">Issued</dt>
              <dd>{formatDateTime(issuedAt)}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-slate-500">Status</dt>
              <dd className="font-semibold text-slate-900">{STATUS_LABELS[deal.status as DealStatus]}</dd>
            </div>
          </dl>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</h2>
            <p className="mt-1 font-semibold text-slate-900">{deal.buyer.displayName}</p>
            <p className="text-sm text-slate-600">{deal.buyer.email}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Counterparty (seller)</h2>
            <p className="mt-1 font-semibold text-slate-900">{deal.seller.displayName}</p>
            <p className="text-sm text-slate-600">{deal.seller.email}</p>
          </div>
        </section>

        <section className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 text-right font-semibold">Amount (USDT)</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {/* Priced items get a row each. Unpriced ones sit under the lot's
                  single price, because that is how the lot was actually sold —
                  splitting 9,000 five ways would invent figures nobody agreed. */}
              {itemsArePriced &&
                deal.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 pl-4">{item.label}</td>
                    <td className="py-2 text-right font-mono">{formatUsdtFixed(item.amountMicro!)}</td>
                  </tr>
                ))}

              <tr className="border-b border-slate-200">
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">
                    {itemsArePriced ? `Subtotal — ${deal.title}` : deal.title}
                  </p>
                  {!itemsArePriced && deal.items.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {deal.items.map((item) => (
                        <li key={item.id} className="flex gap-2">
                          <span aria-hidden>•</span>
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-3 text-right align-top font-mono">{formatUsdtFixed(deal.payoutMicro)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">Escrow service fee ({feePercent}%)</p>
                </td>
                <td className="py-3 text-right font-mono">{formatUsdtFixed(deal.feeMicro)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 text-slate-900">
                <td className="pt-3 pr-4 text-right font-semibold">Total paid by buyer</td>
                <td className="pt-3 text-right font-mono text-lg font-bold">{formatUsdtFixed(deal.amountMicro)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="grid gap-6 border-t border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</h2>
            <dl className="mt-2 space-y-1 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="text-slate-500">Method</dt>
                <dd>
                  USDT · {networkShort(network)} ({networkLabel(network)})
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500">Received</dt>
                <dd>{paid ? formatDateTime(deal.fundedAt) : "Not yet received"}</dd>
              </div>
              {deal.payments.map((payment) => (
                <div key={payment.id} className="flex gap-2">
                  <dt className="text-slate-500">Tx</dt>
                  <dd className="break-all font-mono text-xs">{payment.txHash}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Handover</h2>
            <p className="mt-2 text-sm text-slate-700">
              {deal.credentials.length} item{deal.credentials.length === 1 ? "" : "s"} in the vault · {confirmed}{" "}
              confirmed
              {rejected > 0 && ` · ${rejected} reported as not working`}
            </p>
            {rejected > 0 && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Funds remain held pending resolution of the outstanding item{rejected === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </section>

        {/* Nothing is printed under a paid invoice. The unpaid notice stays:
            without it, an invoice for money that never arrived looks exactly
            like one for money that did. */}
        {!paid && (
          <footer className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            <p>This deal has not been funded yet, so no payment has been received against this invoice.</p>
          </footer>
        )}
      </article>
    </div>
  );
}
