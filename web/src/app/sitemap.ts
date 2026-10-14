import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { getCategories } from '@/lib/queries';
import { siteUrl } from '@/lib/seo';
import { LOCALES, localePath } from '@/i18n/config';

export const dynamic = 'force-dynamic';

/** Every page in both languages, each entry naming its other-language twin. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const products = db
    .prepare(
      `SELECT p.slug, p.created_at FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 AND c.is_active = 1 ORDER BY p.id`,
    )
    .all() as { slug: string; created_at: string }[];

  const pages: { path: string; changeFrequency: 'weekly' | 'monthly' | 'yearly'; priority: number; lastModified?: Date }[] = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    ...getCategories().map((c) => ({ path: `/categories/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.9 })),
    ...products.map((p) => ({
      path: `/products/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      lastModified: new Date(`${p.created_at.replace(' ', 'T')}Z`),
    })),
    { path: '/projects', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/about', changeFrequency: 'yearly', priority: 0.5 },
    { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  ];

  return pages.flatMap(({ path, ...rest }) =>
    LOCALES.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      ...rest,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(l, path)}`])) },
    })),
  );
}
