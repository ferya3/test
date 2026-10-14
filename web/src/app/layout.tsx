import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { getSettings } from '@/lib/queries';
import { siteUrl } from '@/lib/seo';

/*
 * Every page reads the catalogue and settings from SQLite on request. Those
 * reads take microseconds, and rendering per request means an edit in the
 * admin shows on the site immediately — no rebuild, no stale cache.
 */
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const settings = getSettings();

  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${settings.company_name} | ${settings.company_tagline}`, template: `%s | ${settings.company_name}` },
    description: settings.company_tagline,
    applicationName: settings.company_name,
    openGraph: { type: 'website', locale: 'fa_IR', siteName: settings.company_name },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#faf8f5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
