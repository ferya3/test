import Link from "next/link";
import { getSettings } from "@/lib/deals";
import { formatUsdt } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "How it works" };

export default async function HowItWorksPage() {
  const settings = await getSettings();

  const steps = [
    {
      title: "Agree the terms",
      body: "The buyer opens a deal against a listing or straight from the seller's account email. Both sides see the same written terms: what is handed over, for how much, and how long the buyer has to inspect it.",
    },
    {
      title: "The buyer funds escrow",
      body: `Each deal gets its own USDT deposit address. Nothing happens until the transfer confirms on-chain — the buyer has ${settings.paymentWindowMins} minutes to send it before the deal expires.`,
    },
    {
      title: "The seller hands over the credentials",
      body: "Once the money is confirmed, the seller submits the login, password, registered email and any recovery codes. Every value is encrypted before it is stored, and the seller cannot read them back afterwards.",
    },
    {
      title: "The buyer inspects",
      body: "The buyer unlocks the vault and checks the account works: sign in, change the password, confirm the recovery email. Every reveal is timestamped on the audit trail.",
    },
    {
      title: "Funds are released",
      body: "The buyer confirms and the seller is paid, minus the escrow fee. If the buyer never responds, funds release automatically when the inspection window closes.",
    },
    {
      title: "…or a moderator steps in",
      body: "Either side can open a dispute while the deal is live. The escrow freezes, a moderator reads the thread, and the funds go to whichever side the evidence supports.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="How Sedo works"
        subtitle="A neutral third party holds both halves of the trade, so neither side has to go first."
      />

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <Card key={step.title}>
            <div className="flex gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300">
                {index + 1}
              </span>
              <div>
                <h2 className="font-semibold text-slate-100">{step.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </ol>

      <Card title="Fees and limits">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Escrow fee</dt>
            <dd className="text-slate-200">{(settings.feeBasisPoints / 100).toFixed(2)}% — added on top, paid by the buyer</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Deal size</dt>
            <dd className="text-slate-200">
              {formatUsdt(settings.minDealMicro)} – {formatUsdt(settings.maxDealMicro)} USDT
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Accepted asset</dt>
            <dd className="text-slate-200">USDT on TRON (TRC-20)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Seller fee</dt>
            <dd className="text-slate-200">None — they receive the full asking price</dd>
          </div>
        </dl>
      </Card>

      <div className="flex gap-3">
        <Link className="btn btn-primary" href="/register">
          Create an account
        </Link>
        <Link className="btn btn-ghost" href="/listings">
          Browse the marketplace
        </Link>
      </div>
    </div>
  );
}
