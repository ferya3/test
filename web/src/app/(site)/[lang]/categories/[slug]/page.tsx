import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackageSearch } from 'lucide-react';
import { FilterBar, type FilterGroup } from '@/components/catalog/filter-bar';
import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { getCategories, getCategory, getFacets, getProducts, getSettings } from '@/lib/queries';
import { catalogFor } from '@/lib/attributes';
import { parseFilters } from '@/lib/filters';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { jsonLd, siteUrl } from '@/lib/seo';
import { breadcrumbLd, pageMetadata } from '@/lib/metadata';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

type Props = {
  params: Promise<{ slug: string; lang: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, lang } = await params;
  const category = getCategory(slug, lang);
  if (!category) return {};

  // Any query string is a filtered view (or junk): the plain group page is
  // the one to index, and the canonical below already points there.
  const filtered = Object.keys(await searchParams).length > 0;
  const brand = getSettings(lang).company_name;

  return pageMetadata({
    lang,
    path: `/categories/${category.slug}`,
    brand,
    title: category.name,
    absoluteTitle: category.seo_title || undefined,
    description: category.seo_description || categoryDescription(category.short, category.description),
    image: category.image || null,
    noindex: filtered,
  });
}

/** The summary, plus the long text when the summary alone is too short for a result. */
function categoryDescription(short: string, long: string) {
  if (!long || short.length >= 110) return short || long;
  return long.startsWith(short) ? long : `${short} ${long}`;
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug, lang } = await params;
  const category = getCategory(slug, lang);
  if (!category) notFound();

  const t = getDictionary(lang).catalog;
  const href = (p: string) => localePath(lang, p);
  const catalog = catalogFor(lang);
  const filters = parseFilters(await searchParams, catalog);
  const products = getProducts(category.id, filters, lang);
  const facets = getFacets(category.id, filters);
  const categories = getCategories(lang);
  const photo = category.image;
  const crumbs = breadcrumbLd(siteUrl(), [
    { name: getDictionary(lang).home, path: href('/') },
    { name: category.name, path: href(`/categories/${category.slug}`) },
  ]);

  const groups: FilterGroup[] = catalog.filterGroups.map((g) => ({
    param: g.param,
    label: t.filters[g.key],
    selected: filters[g.key],
    options: g.options
      .map(([value, label]) => ({ value, label, count: facets[g.key][value] ?? 0 }))
      // Thicknesses this group is never made in are not options at all.
      .filter((o) => g.key !== 'thicknesses' || o.count > 0 || filters.thicknesses.includes(o.value)),
  }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />

      {/* A cover photo (set in the admin) runs as a clean banner with nothing
          written on it; the heading block always follows on the page itself,
          so the h1 and description read the same with or without a photo. */}
      {photo && (
        <div className="relative aspect-[16/9] max-h-[28rem] w-full overflow-hidden bg-ink-100 sm:aspect-[21/8]">
          {/* eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp */}
          <img src={mediaUrl(photo)} alt={category.name} fetchPriority="high" className="size-full object-cover" />
        </div>
      )}

      <section
        className={cn(
          'relative overflow-hidden',
          !photo && 'bg-ink-50 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgb(230_196_126/0.35),transparent_70%)]',
        )}
      >
        <div className={cn('relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', photo ? 'pt-5 pb-4 sm:pt-8' : 'pt-5 pb-6 sm:pt-14 sm:pb-8 lg:pt-16')}>
          <nav aria-label={t.breadcrumb} className="mb-6 hidden text-sm text-ink-500 sm:block">
            <Link href={href('/')} className="hover:text-ink-950">
              {getDictionary(lang).home}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-800">{category.name}</span>
          </nav>

          {/* Switch between groups without going back to the homepage. A
              scrolling row when there are more groups than fit. */}
          {categories.length > 1 && (
            <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[var(--shadow-soft)] [scrollbar-width:none] sm:mb-6 sm:inline-flex sm:w-auto sm:max-w-full">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={href(`/categories/${c.slug}`)}
                  aria-current={c.id === category.id ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-2.5 text-center text-sm font-bold whitespace-nowrap transition-colors sm:px-4 sm:py-2',
                    categories.length <= 2 && 'flex-1 sm:flex-none',
                    c.id === category.id ? 'bg-ink-950 text-paper' : 'text-ink-600 hover:text-ink-950',
                  )}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          <h1 className="text-h1 font-black text-balance text-ink-950">{category.name}</h1>
          {/* The one-line summary on a phone, so the products start on the first
              screen; the full description from `sm` up. */}
          <p className="mt-3 text-ink-600 sm:hidden">{category.short}</p>
          <p className="mt-4 hidden max-w-3xl text-lead text-ink-600 sm:block">{category.description}</p>
        </div>
      </section>

      <section aria-labelledby="product-list" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
        {/* Keeps the outline h1 → h2 → h3 (each card's name is an h3). */}
        <h2 id="product-list" className="sr-only">
          {t.listHeading} {category.name}
        </h2>
        <FilterBar groups={groups} total={products.length} />

        {products.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:mt-8 lg:grid-cols-4">
            {products.map((product, i) => (
              <li key={product.id}>
                <ProductCard product={product} locale={lang} priority={i < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-ink-200 px-6 py-16 text-center">
            <PackageSearch className="size-10 text-ink-400" />
            <p className="mt-4 text-lg font-bold text-ink-900">{t.emptyTitle}</p>
            <p className="mt-1 text-ink-600">{t.emptyLead}</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href={href(`/categories/${category.slug}`)}>{t.clearAllFilters}</Link>
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
