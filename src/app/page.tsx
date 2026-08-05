import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import { getSettings } from "@/lib/deals";
import { Card } from "@/components/ui";

export default async function HomePage() {
  const settings = await getSettings();
  const [completed, members, volume] = await Promise.all([
    prisma.deal.count({ where: { status: "COMPLETED" } }),
    prisma.user.count(),
    prisma.deal.aggregate({ where: { status: "COMPLETED" }, _sum: { amountMicro: true } }),
  ]);

  // The showcase figures are operator-set baselines added to the real counts,
  // both editable under Admin -> Settings.
  const shownMembers = members + settings.showcaseUsers;
  const shownDeals = completed + settings.showcaseDeals;

  return (
    <div className="space-y-16">
      <section className="grid gap-10 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <span className="badge border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            Settled in USDT · TRC-20
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl">
            The trusted middleman for buying and selling digital accounts.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            The buyer sends USDT to Sedo, not to the seller. We hold the funds while the seller hands over the
            login details through an encrypted vault. The seller is only paid once the buyer confirms everything works.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/register">
              Start a deal
            </Link>
            <Link className="btn btn-ghost" href="/how-it-works">
              See how it works
            </Link>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Members</dt>
              <dd className="text-lg font-semibold text-slate-100">{shownMembers.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Deals completed</dt>
              <dd className="text-lg font-semibold text-slate-100">{shownDeals.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Escrow fee</dt>
              <dd className="text-lg font-semibold text-slate-100">
                {(settings.feeBasisPoints / 100).toFixed(2)}%
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Volume protected</dt>
              <dd className="text-lg font-semibold text-slate-100">
                {formatUsdt(volume._sum.amountMicro ?? 0n)} USDT
              </dd>
            </div>
          </dl>
        </div>

        <Card className="lg:justify-self-end lg:w-[26rem]">
          <ol className="space-y-5">
            {[
              {
                step: "1",
                title: "Buyer funds escrow",
                body: "Every deal gets its own USDT deposit address. Nothing moves until the transfer confirms on-chain.",
              },
              {
                step: "2",
                title: "Seller submits credentials",
                body: "Logins, passwords and recovery codes go into an encrypted vault — sealed until the money is in.",
              },
              {
                step: "3",
                title: "Buyer inspects",
                body: "The buyer unlocks the vault and checks the account within the agreed inspection window.",
              },
              {
                step: "4",
                title: "Funds released",
                body: "Confirm and the seller is paid. Something wrong? Open a dispute and a moderator decides.",
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-sm font-semibold text-emerald-300">
                  {item.step}
                </span>
                <div>
                  <p className="font-medium text-slate-100">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Neither side goes first",
            body: "The classic deadlock — who sends first? — disappears. The buyer's money and the seller's credentials both sit with us until the trade is done.",
          },
          {
            title: "Secrets encrypted at rest",
            body: "Credentials are sealed with AES-256-GCM under a key derived per deal. The buyer can only decrypt them after the escrow is funded.",
          },
          {
            title: "One address per deal",
            body: "Deposit addresses are derived from a watch-only wallet, so no private key is ever stored on the web server.",
          },
          {
            title: "Auto-release protects sellers",
            body: "If the buyer goes quiet, funds release automatically when the inspection window closes. No hostage situations.",
          },
          {
            title: "Moderated disputes",
            body: "Either side can escalate while the deal is live. A moderator reads the thread and either releases or refunds.",
          },
          {
            title: "Full audit trail",
            body: "Every payment, reveal and release is written to an append-only log with actor and timestamp.",
          },
        ].map((feature) => (
          <Card key={feature.title}>
            <h3 className="font-semibold text-slate-100">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{feature.body}</p>
          </Card>
        ))}
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-6 p-8">
        <div>
          <h2 className="text-2xl font-semibold text-slate-50">Ready to trade without trusting a stranger?</h2>
          <p className="mt-2 text-slate-400">
            Deals from {formatUsdt(settings.minDealMicro)} to {formatUsdt(settings.maxDealMicro)} USDT.
          </p>
        </div>
        <Link className="btn btn-primary" href="/register">
          Create your account
        </Link>
      </section>
    </div>
  );
}
