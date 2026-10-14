/**
 * The site's two languages. Persian is the default and lives at the root
 * (`/products/…`); English lives under `/en` (`/en/products/…`). Keeping
 * Persian unprefixed means none of the addresses already shared or indexed
 * change.
 *
 * Imported by the middleware, so nothing here may touch Node APIs.
 */
export const LOCALES = ['fa', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fa';

export const isLocale = (value: string | undefined | null): value is Locale =>
  (LOCALES as readonly string[]).includes(value ?? '');

export const dirOf = (locale: Locale) => (locale === 'fa' ? 'rtl' : 'ltr');

/** A site path in `locale`: `/about` → `/about` (fa) or `/en/about` (en). */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** The same page in the other language — for the language switcher. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const bare = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  return localePath(to, bare);
}
