import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Brand } from './header';
import { NAV } from '@/lib/nav';
import { getCategories, getSettings } from '@/lib/queries';
import { faDigits, persianYear } from '@/lib/catalog';

export function Footer() {
  const settings = getSettings();
  const categories = getCategories();

  return (
    <footer className="relative overflow-hidden bg-ink-950 text-ink-300">
      {/* A single soft pool of gold light in the corner — the footer's only ornament. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-1/4 size-[32rem] rounded-full bg-gold-500/10 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Brand name={settings.company_name} light />
          <p className="max-w-xs text-sm leading-7">{settings.company_tagline}</p>
        </div>

        <FooterList title="محصولات" items={categories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))} />
        <FooterList title="دسترسی سریع" items={NAV.map((n) => ({ href: n.href, label: n.label }))} />

        <div>
          <h2 className="mb-4 text-sm font-bold text-paper">تماس</h2>
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Phone className="mt-1 size-4 shrink-0 text-gold-400" />
              <a href={`tel:${settings.contact_phone.replace(/[^\d+]/g, '')}`} className="ltr-isolate hover:text-paper">
                {settings.contact_phone}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-1 size-4 shrink-0 text-gold-400" />
              <a href={`mailto:${settings.contact_email}`} className="ltr-isolate hover:text-paper">
                {settings.contact_email}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-1 size-4 shrink-0 text-gold-400" />
              <span>{settings.contact_address}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs sm:px-6 lg:px-8">
          © {faDigits(persianYear())} {settings.company_name}. همهٔ حقوق محفوظ است.
        </p>
      </div>
    </footer>
  );
}

function FooterList({ title, items }: { title: string; items: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="mb-4 text-sm font-bold text-paper">{title}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            {/* Padded to a real tap target, not a bare line of text. */}
            <Link href={item.href} className="inline-block py-1.5 transition-colors hover:text-gold-300">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
