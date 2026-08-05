import { getSettings } from "@/lib/deals";
import { Card, PageHeader } from "@/components/ui";

export const metadata = {
  title: "Imprint",
  description: "Who operates this platform, and how to reach them.",
};

/**
 * Germany requires every commercial website to name its operator, with a
 * reachable postal address (§5 TMG). The details come from Admin → Settings
 * rather than the source, so the operator fills in their own — a page like
 * this is worse than useless if what it says is not true.
 */
export default async function ImprintPage() {
  const settings = await getSettings();

  const lines = [
    settings.companyStreet,
    [settings.companyPostalCode, settings.companyCity].filter(Boolean).join(" "),
    settings.companyCountry,
  ].filter((line) => line.trim().length > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Imprint" subtitle="Information about the operator of this site" />

      <Card title="Operator">
        <p className="font-semibold text-slate-100">{settings.companyName}</p>
        <address className="mt-2 space-y-0.5 text-sm not-italic text-slate-300">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </address>

        {settings.companyEmail && (
          <p className="mt-4 text-sm text-slate-300">
            <span className="text-slate-500">Email: </span>
            <a className="hover:text-emerald-300" href={`mailto:${settings.companyEmail}`}>
              {settings.companyEmail}
            </a>
          </p>
        )}

        {settings.companyRegistration && (
          <p className="mt-1 text-sm text-slate-300">
            <span className="text-slate-500">Registration: </span>
            {settings.companyRegistration}
          </p>
        )}
      </Card>

      <Card title="Nature of the service">
        <p className="text-sm leading-relaxed text-slate-300">
          {settings.companyName} operates an escrow service for digital goods. It holds a buyer&apos;s funds and a
          seller&apos;s credentials until both sides of a trade are satisfied, and is not a party to the underlying
          sale. Disputes about the goods themselves are decided between buyer and seller, with the platform acting
          only as the holder of the funds.
        </p>
      </Card>
    </div>
  );
}
