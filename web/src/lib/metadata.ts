/**
 * Page metadata, built the same way for every public page: title, a
 * description of a length search engines show in full, canonical and
 * language alternates, Open Graph and Twitter cards with an image, and
 * noindex where a page is a filtered view of another.
 */
import type { Metadata } from 'next';
import { alternates } from './seo.ts';
import { mediaUrl } from './media.ts';

type Lang = 'fa' | 'en';

/**
 * A description cut to about 155 characters at a word boundary. Google shows
 * roughly 150–160; a longer one is cut mid-word in the results.
 */
export function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[،,;:.\-—\s]+$/, '')}…`;
}

export function pageMetadata({
  lang,
  path,
  brand,
  title,
  absoluteTitle,
  description,
  image,
  noindex = false,
  type = 'website',
}: {
  lang: Lang;
  /** The page's path without a language prefix, e.g. `/products/oak`. */
  path: string;
  brand: string;
  /** Shown as "title | brand". */
  title?: string;
  /** Shown exactly as given (an SEO title set in the admin, or the home page). */
  absoluteTitle?: string;
  description: string;
  /** An uploaded image name; without one the brand's share image is used. */
  image?: string | null;
  noindex?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const fullTitle = absoluteTitle || (title ? `${title} | ${brand}` : brand);
  const desc = clampDescription(description);
  const links = alternates(lang, path);
  const images = image
    ? [{ url: mediaUrl(image), alt: title ?? brand }]
    : [{ url: `/og-${lang}.png`, width: 1200, height: 630, alt: brand }];

  return {
    title: { absolute: fullTitle },
    description: desc,
    alternates: links,
    openGraph: {
      type,
      url: links.canonical,
      siteName: brand,
      title: fullTitle,
      description: desc,
      locale: lang === 'fa' ? 'fa_IR' : 'en_US',
      alternateLocale: lang === 'fa' ? ['en_US'] : ['fa_IR'],
      images,
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description: desc, images: images.map((i) => i.url) },
    // A filtered list is a view of the group page, which is the one to index;
    // its links are still followed.
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

/** BreadcrumbList JSON-LD: what Google shows as the path above a result. */
export function breadcrumbLd(base: string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${base}${item.path}`,
    })),
  };
}
