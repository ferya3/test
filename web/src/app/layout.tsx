import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { siteUrl } from '@/lib/seo';
import { getSettings } from '@/lib/queries';
import { dirOf, isLocale } from '@/i18n/config';

/*
 * Every page reads the catalogue and settings from SQLite on request. Those
 * reads take microseconds, and rendering per request means an edit in the
 * admin shows on the site immediately — no rebuild, no stale cache.
 */
export const dynamic = 'force-dynamic';

// Titles and descriptions are set per language in app/(site)/[lang]/layout.tsx.
export function generateMetadata(): Metadata {
  // The icon from the admin, served as PNG by app/site-icon.png; its file name
  // in the URL makes a new upload a new address, past any cached copy.
  const v = getSettings().site_icon || 'default';
  const icon = (s: number) => `/site-icon.png?s=${s}&v=${v}`;

  return {
    metadataBase: new URL(siteUrl()),
    formatDetection: { telephone: false },
    icons: {
      icon: [
        { url: icon(32), sizes: '32x32', type: 'image/png' },
        { url: icon(512), sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: icon(180), sizes: '180x180', type: 'image/png' }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#f8fafb',
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
