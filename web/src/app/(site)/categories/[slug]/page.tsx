import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PackageSearch } from 'lucide-react';
import { FilterBar, type FilterGroup } from '@/components/catalog/filter-bar';
import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { FILTER_GROUPS, getCategories, getCategory, getFacets, getProducts } from '@/lib/queries';
import { parseFilters } from '@/lib/filters';
import { cn } from '@/lib/utils';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.short,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = getCategory((await params).slug);
  if (!category) notFound();

  const filters = parseFilters(await searchParams);
  const products = getProducts(category.id, filters);
  const facets = getFacets(category.id, filters);
  const categories = getCategories();

  const groups: FilterGroup[] = FILTER_GROUPS.map((g) => ({
    param: g.param,
    label: g.label,
    selected: filters[g.key] as string[],
    options: g.options
      .map(([value, label]) => ({ value, label, count: facets[g.key][value] ?? 0 }))
      // Thicknesses this group is never made in are not options at all.
      .filter((o) => g.key !== 'thicknesses' || o.count > 0 || (filters.thicknesses as string[]).includes(o.value)),
  }));

  return (
    <>
      <section className="relative overflow-hidden bg-ink-50 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgb(230_196_126/0.35),transparent_70%)]">
        <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14 lg:px-8 lg:pt-16">
          <nav aria-label="مسیر" className="mb-6 text-sm text-ink-500">
            <Link href="/" className="hover:text-ink-950">
              خانه
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-800">{category.name}</span>
          </nav>

          {/* Switch between the two groups without going back to the homepage. */}
          <div className="mb-6 inline-flex rounded-xl bg-white p-1 shadow-[var(--shadow-soft)]">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                aria-current={c.id === category.id ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
                  c.id === category.id ? 'bg-ink-950 text-paper' : 'text-ink-600 hover:text-ink-950',
                )}
              >
                {c.name}
              </Link>
            ))}
          </div>

          <h1 className="text-h1 font-black text-balance text-ink-950">{category.name}</h1>
          <p className="mt-4 max-w-3xl text-lead text-ink-600">{category.description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <FilterBar groups={groups} total={products.length} />

        {products.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:mt-8 lg:grid-cols-4">
            {products.map((product, i) => (
              <li key={product.id}>
                <ProductCard product={product} priority={i < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-ink-200 px-6 py-16 text-center">
            <PackageSearch className="size-10 text-ink-400" />
            <p className="mt-4 text-lg font-bold text-ink-900">محصولی با این فیلترها پیدا نشد</p>
            <p className="mt-1 text-ink-600">یکی از فیلترها را بردارید یا همه را پاک کنید.</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href={`/categories/${category.slug}`}>حذف همهٔ فیلترها</Link>
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
