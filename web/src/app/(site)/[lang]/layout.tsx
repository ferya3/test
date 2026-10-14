import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SmoothScroll } from '@/components/providers/smooth-scroll';
import { Header } from '@/components/site/header';
import { Footer } from '@/components/site/footer';
import { LocaleProvider } from '@/i18n/client';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, type Locale } from '@/i18n/config';
import { getSettings } from '@/lib/queries';

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const settings = getSettings(lang);

  return {
    title: { default: `${settings.company_name} | ${settings.company_tagline}`, template: `%s | ${settings.company_name}` },
    description: settings.company_tagline,
    applicationName: settings.company_name,
    openGraph: { type: 'website', locale: lang === 'fa' ? 'fa_IR' : 'en_US', siteName: settings.company_name },
  };
}

/**
 * The public site, in one language. The language comes from the URL (see
 * src/middleware.ts); anything but `fa` or `en` in that position is a 404.
 *
 * Boxed layout: from `lg` up the whole site sits in a centred box on a quiet
 * backdrop. On phones and tablets it stays edge to edge — margins there would
 * only take width away from the content.
 *
 * The box clips with `overflow: clip`, not `hidden`: `hidden` would make it a
 * scroll container, and the sticky header and filter bar would stop sticking.
 * It must also never get a transform or filter, which would break the
 * `position: fixed` the pinned production section relies on.
 */
export default async function SiteLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const t = getDictionary(locale);

  return (
    <LocaleProvider locale={locale} t={t}>
      <SmoothScroll>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-paper"
        >
          {t.skipToContent}
        </a>
        <div className="site-box">
          <Header locale={locale} />
          <main id="main" className="overflow-x-clip">
            {children}
          </main>
          <Footer locale={locale} />
        </div>
      </SmoothScroll>
    </LocaleProvider>
  );
}
