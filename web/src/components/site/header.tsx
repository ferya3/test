import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { DesktopNav, LanguageSwitch, MenuButton, MobileMenu } from './navigation';
import { getCategories, getSettings } from '@/lib/queries';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

/** The brand mark: a gold monogram tile and the wordmark, both from settings. */
export function Brand({ name, locale, light = false }: { name: string; locale: Locale; light?: boolean }) {
  return (
    <Link href={localePath(locale, '/')} className="flex shrink-0 items-center gap-2.5" aria-label={`${name} — ${getDictionary(locale).home}`}>
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-gold-300 to-gold-500 text-lg font-black text-ink-950 shadow-[var(--shadow-gold)]"
      >
        {Array.from(name.trim())[0]}
      </span>
      <span className={light ? 'text-lg font-extrabold text-paper' : 'text-lg font-extrabold text-ink-950'}>
        {name}
      </span>
    </Link>
  );
}

export function Header({ locale }: { locale: Locale }) {
  const settings = getSettings(locale);
  const t = getDictionary(locale);
  const groups = getCategories(locale).map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-ink-100/80 bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
          <Brand name={settings.company_name} locale={locale} />
          <DesktopNav groups={groups} />

          <div className="flex items-center gap-2">
            {/* useSearchParams needs a Suspense boundary to render on the server. */}
            <Suspense fallback={null}>
              <LanguageSwitch />
            </Suspense>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={localePath(locale, '/contact')}>{t.header.consult}</Link>
            </Button>
            <MenuButton />
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <MobileMenu phone={settings.contact_phone} groups={groups} />
      </Suspense>
    </>
  );
}
