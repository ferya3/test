import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  const sections = [
    {
      title: "1. What EscrowBridge does",
      body: "EscrowBridge is a neutral intermediary. We hold a buyer's USDT and a seller's credentials while a trade completes. We are not a party to the trade itself and do not verify the underlying goods beyond what the parties tell us.",
    },
    {
      title: "2. Funding and settlement",
      body: "A deal is funded only when the required amount confirms on-chain at the deposit address shown for that deal. Transfers of other assets, on other networks, or to any other address are not credited and cannot be recovered. Payouts and refunds are sent to the address on file for the receiving party; an incorrect address is not recoverable.",
    },
    {
      title: "3. Inspection and auto-release",
      body: "After delivery the buyer has the inspection window agreed in the deal to confirm or dispute. If the window closes with no action, escrow releases automatically to the seller.",
    },
    {
      title: "4. Disputes",
      body: "Either party may open a dispute while a deal is live. A moderator reviews the deal thread and decides whether to release or refund. That decision is final within the platform.",
    },
    {
      title: "5. Fees",
      body: "The escrow fee shown at the time the deal is opened is deducted from the seller's payout. Network fees for outgoing transfers are borne by the receiving party.",
    },
    {
      title: "6. Acceptable use",
      body: "You may not use EscrowBridge for anything unlawful, for stolen or fraudulently obtained accounts, or for any trade you are not entitled to make. You are responsible for checking that the sale you are making is permitted by the terms of the service the account belongs to — many providers prohibit account transfers, and a deal completed here does not override those rules. We suspend accounts and cooperate with lawful requests where abuse is established.",
    },
    {
      title: "7. Credential handling",
      body: "Credentials submitted to a deal are encrypted at rest and are readable only by the buyer on that deal, and by moderators when a dispute requires it. Credentials are purged after a deal settles. Do not submit secrets that protect anything beyond the item being sold.",
    },
    {
      title: "8. Liability",
      body: "Our responsibility is limited to correctly holding and releasing the escrowed amount for a deal in line with these terms. We are not liable for the condition of what is sold, for a provider reclaiming a transferred account, or for losses caused by an incorrect address supplied by a user.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Terms of service" subtitle="The rules that govern deals settled through EscrowBridge." />
      {sections.map((section) => (
        <Card key={section.title}>
          <h2 className="font-semibold text-slate-100">{section.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{section.body}</p>
        </Card>
      ))}
      <p className="px-1 text-xs text-slate-600">
        This is a template, not legal advice. Have a lawyer in your jurisdiction review it — holding customer funds is a
        regulated activity in most places.
      </p>
    </div>
  );
}
