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
