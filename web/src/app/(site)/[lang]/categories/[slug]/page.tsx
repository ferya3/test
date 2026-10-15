import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackageSearch } from 'lucide-react';
import { FilterBar, type FilterGroup } from '@/components/catalog/filter-bar';
import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { getCategories, getCategory, getFacets, getProducts } from '@/lib/queries';
import { catalogFor } from '@/lib/attributes';
import { parseFilters } from '@/lib/filters';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { alternates } from '@/lib/seo';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

type Props = {
  params: Promise<{ slug: string; lang: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang } = await params;
  const category = getCategory(slug, lang);
  if (!category) return {};

  return {
    title: category.name,
    description: category.short,
    alternates: alternates(lang, `/categories/${category.slug}`),
  };
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
      {/* The group's header. With a photo (set in the admin) the photo fills
          it and the text sits on a dark wash; without, the plain light band. */}
      <section
        className={cn(
          'relative isolate overflow-hidden',
          photo ? 'bg-ink-950 text-paper' : 'bg-ink-50 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgb(230_196_126/0.35),transparent_70%)]',
        )}
      >
        {photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp */}
            <img src={mediaUrl(photo)} alt="" fetchPriority="high" className="absolute inset-0 -z-10 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/35" />
          </>
        )}

        <div className={cn('relative mx-auto max-w-7xl px-4 pt-5 pb-6 sm:px-6 sm:pt-14 sm:pb-8 lg:px-8 lg:pt-16', photo && 'pt-10 sm:pt-24 lg:pt-32')}>
          <nav aria-label={t.breadcrumb} className={cn('mb-6 hidden text-sm sm:block', photo ? 'text-ink-300' : 'text-ink-500')}>
            <Link href={href('/')} className={photo ? 'hover:text-paper' : 'hover:text-ink-950'}>
              {getDictionary(lang).home}
            </Link>
            <span className="mx-2">/</span>
            <span className={photo ? 'text-paper' : 'text-ink-800'}>{category.name}</span>
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

          <h1 className={cn('text-h1 font-black text-balance', photo ? 'text-paper' : 'text-ink-950')}>{category.name}</h1>
          {/* The one-line summary on a phone, so the products start on the first
              screen; the full description from `sm` up. */}
          <p className={cn('mt-3 sm:hidden', photo ? 'text-ink-200' : 'text-ink-600')}>{category.short}</p>
          <p className={cn('mt-4 hidden max-w-3xl text-lead sm:block', photo ? 'text-ink-200' : 'text-ink-600')}>{category.description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
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
