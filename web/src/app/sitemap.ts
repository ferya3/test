import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { getCategories } from '@/lib/queries';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const products = db
    .prepare(
      `SELECT p.slug, p.created_at FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 AND c.is_active = 1 ORDER BY p.id`,
    )
    .all() as { slug: string; created_at: string }[];

  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    ...getCategories().map((c) => ({ url: `${base}/categories/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.9 })),
    ...products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: new Date(`${p.created_at.replace(' ', 'T')}Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${base}/projects`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/about`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
