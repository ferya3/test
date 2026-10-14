/** The canonical origin, from SITE_URL; used for metadata, sitemap and JSON-LD. */
export function siteUrl(): string {
  const url = process.env.SITE_URL ?? 'http://localhost:3000';

  return url.replace(/\/+$/, '');
}

/**
 * JSON-LD for a <script> tag. `<` is escaped so a value containing
 * `</script>` cannot close the tag early — the one XSS route JSON-LD has.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Canonical and hreflang links for a page, given its path without a language
 * prefix: each language version names itself as canonical and points to the
 * other, so search engines show the right one to each reader.
 */
export function alternates(locale: 'fa' | 'en', path: string) {
  const at = (l: 'fa' | 'en') => (l === 'fa' ? path : path === '/' ? '/en' : `/en${path}`);
  return {
    canonical: at(locale),
    languages: { fa: at('fa'), en: at('en'), 'x-default': at('fa') },
  };
}
