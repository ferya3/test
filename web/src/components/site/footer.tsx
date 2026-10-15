import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Brand } from './header';
import { NAV } from '@/lib/nav';
import { getCategories, getSettings } from '@/lib/queries';
import { faDigits, persianYear } from '@/lib/catalog';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

export function Footer({ locale }: { locale: Locale }) {
  const settings = getSettings(locale);
  const categories = getCategories(locale);
  const t = getDictionary(locale);
  const href = (p: string) => localePath(locale, p);
  // The Solar Hijri year on the Persian site, the Gregorian on the English.
  const year = locale === 'fa' ? faDigits(persianYear()) : String(new Date().getFullYear());

  return (
    <footer className="relative overflow-hidden bg-ink-950 text-ink-300">
      {/* A single soft pool of gold light in the corner — the footer's only ornament. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-1/4 size-[32rem] rounded-full bg-[rgb(58_108_156/0.3)] blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16 lg:grid-cols-4 lg:px-8">
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <Brand locale={locale} light />
          <p className="max-w-xs text-sm leading-7">{settings.company_tagline}</p>
        </div>

        <FooterList title={t.footer.products} items={categories.map((c) => ({ href: href(`/categories/${c.slug}`), label: c.name }))} />
        <FooterList title={t.footer.quickLinks} items={NAV.map((n) => ({ href: href(n.href), label: t.nav[n.key] }))} />

        <div className="col-span-2 lg:col-span-1">
          <h2 className="mb-2 text-sm font-bold text-paper sm:mb-4">{t.footer.contact}</h2>
          <ul className="flex flex-col text-sm">
            {/* Whole rows are the tap targets, at least 44px tall. */}
            <li>
              <a href={`tel:${settings.contact_phone.replace(/[^\d+]/g, '')}`} className="flex min-h-11 items-center gap-2.5 hover:text-paper">
                <Phone className="size-4 shrink-0 text-gold-400" />
                <span className="ltr-isolate">{settings.contact_phone}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.contact_email}`} className="flex min-h-11 items-center gap-2.5 hover:text-paper">
                <Mail className="size-4 shrink-0 text-gold-400" />
                <span className="ltr-isolate">{settings.contact_email}</span>
              </a>
            </li>
            <li className="flex items-start gap-2.5 py-2.5">
              <MapPin className="mt-1 size-4 shrink-0 text-gold-400" />
              <span>{settings.contact_address}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs sm:px-6 lg:px-8">
          © {year} {settings.company_name}. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}

function FooterList({ title, items }: { title: string; items: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-paper sm:mb-4">{title}</h2>
      <ul className="flex flex-col text-sm">
        {items.map((item) => (
          <li key={item.href}>
            {/* Padded to a real tap target, not a bare line of text. */}
            <Link href={item.href} className="flex min-h-11 items-center transition-colors hover:text-gold-300">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
