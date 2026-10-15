import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { DesktopNav, LanguageSwitch, MenuButton, MobileMenu } from './navigation';
import { getCategories, getSettings } from '@/lib/queries';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

/**
 * The brand mark, from the admin (هویت برند): the uploaded logo — on the dark
 * footer its dark-background version if there is one — or, without a logo,
 * the company's mark. The company name beside it unless switched off.
 */
export function Brand({ locale, light = false }: { locale: Locale; light?: boolean }) {
  const settings = getSettings(locale);
  const name = settings.company_name;
  const logo = (light && settings.logo_dark) || settings.logo;
  const showName = !logo || settings.brand_show_name !== '0';

  return (
    <Link href={localePath(locale, '/')} className="flex min-w-0 items-center gap-2 sm:gap-2.5" aria-label={`${name} — ${getDictionary(locale).home}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp
        <img src={mediaUrl(logo)} alt={showName ? '' : name} className="h-8 w-auto max-w-[6.5rem] shrink-0 object-contain sm:h-9 sm:max-w-[11rem] lg:h-11" />
      ) : (
        // The company's mark (public/brand), white-roofed on the dark footer.
        // eslint-disable-next-line @next/next/no-img-element -- a small fixed PNG
        <img
          src={light ? '/brand/mark-light.png' : '/brand/mark.png'}
          alt=""
          width={60}
          height={40}
          className="h-9 w-auto shrink-0 lg:h-10"
        />
      )}
      {showName && (
        // Shrinks before the header does: a wide logo and a long name share a 360px phone.
        <span className={cn('truncate font-extrabold', logo ? 'text-base sm:text-lg' : 'text-lg', light ? 'text-paper' : 'text-ink-950')}>
          {name}
        </span>
      )}
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
          <Brand locale={locale} />
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
