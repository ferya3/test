import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  const items = [
    {
      title: "Credentials are encrypted at rest",
      body: "Every secret is sealed with AES-256-GCM under a key derived per deal from a master key held outside the database. The deal id is bound in as additional authenticated data, so a ciphertext copied between deals fails to decrypt rather than leaking.",
    },
    {
      title: "The vault is sealed until escrow is funded",
      body: "A buyer can only decrypt a credential once the seller has delivered on a funded deal. Sellers cannot read back what they submitted — delivery is one-way by design.",
    },
    {
      title: "No private keys on the web server",
      body: "Deposit addresses are derived from a watch-only extended public key. Moving escrowed funds requires the offline treasury wallet, so compromising this application cannot move money.",
    },
    {
      title: "Every sensitive action is logged",
      body: "Payments, reveals, releases, refunds, disputes and admin actions are written to an append-only audit trail with the actor, IP address and timestamp.",
    },
    {
      title: "Sessions are stored as hashes",
      body: "Session tokens are kept only as SHA-256 digests, so a database dump cannot be replayed as a login. Blocking an account revokes its live sessions immediately.",
    },
    {
      title: "Secrets are purged after settlement",
      body: "Once a deal is settled, its credentials are overwritten with an unrecoverable tombstone. Data that no longer exists cannot be stolen.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Security" subtitle="How EscrowBridge protects the money and the secrets it holds." />
      {items.map((item) => (
        <Card key={item.title}>
          <h2 className="font-semibold text-slate-100">{item.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
        </Card>
      ))}

      <Card title="Advice for buyers and sellers">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-400">
          <li>Buyers: change the password and recovery email the moment you take over an account.</li>
          <li>Sellers: never send credentials over chat. Anything outside the vault is outside escrow protection.</li>
          <li>Both: keep the agreement in the deal description. Disputes are decided on what is written there.</li>
          <li>Send only USDT on the network shown on the deal. Other tokens or chains cannot be credited or recovered.</li>
        </ul>
      </Card>
    </div>
  );
}
