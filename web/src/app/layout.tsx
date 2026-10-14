import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { siteUrl } from '@/lib/seo';
import { dirOf, isLocale } from '@/i18n/config';

/*
 * Every page reads the catalogue and settings from SQLite on request. Those
 * reads take microseconds, and rendering per request means an edit in the
 * admin shows on the site immediately — no rebuild, no stale cache.
 */
export const dynamic = 'force-dynamic';

// Titles and descriptions are set per language in app/(site)/[lang]/layout.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#faf8f5',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by the middleware for public pages; the admin is always Persian.
  const header = (await headers()).get('x-locale');
  const locale = isLocale(header) ? header : 'fa';

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
