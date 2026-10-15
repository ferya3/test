import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Droplets, Flame, ShieldCheck, Sparkles } from 'lucide-react';
import { Swatch } from '@/components/catalog/swatch';
import { ProductCard } from '@/components/catalog/product-card';
import { LeadForm } from '@/components/catalog/lead-form';
import { QuoteBar } from '@/components/catalog/quote-bar';
import { Tilt } from '@/components/motion/tilt';
import { Reveal } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/card';
import { list } from '@/lib/catalog';
import { catalogFor } from '@/lib/attributes';
import { getProduct, getRelated, getSettings } from '@/lib/queries';
import { mediaUrl } from '@/lib/media';
import { alternates, jsonLd, siteUrl } from '@/lib/seo';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

type Props = { params: Promise<{ slug: string; lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang } = await params;
  const product = getProduct(slug, lang);
  if (!product) return {};

  return {
    title: product.name,
    description: product.short,
    alternates: alternates(lang, `/products/${product.slug}`),
    openGraph: product.image ? { images: [mediaUrl(product.image)] } : undefined,
  };
}

// In the order of the dictionary's `product.features`.
const FEATURE_ICONS = [ShieldCheck, Flame, Droplets, Sparkles];

export default async function ProductPage({ params }: Props) {
  const { slug, lang } = await params;
  const product = getProduct(slug, lang);
  if (!product) notFound();

  const dict = getDictionary(lang);
  const t = dict.product;
  const href = (p: string) => localePath(lang, p);
  const related = getRelated(product, 4, lang);
  const settings = getSettings(lang);
  const thicknesses = product.thicknesses.split(',').filter(Boolean);
  const catalog = catalogFor(lang);

  const specs = [
    [t.code, <span key="c" className="ltr-isolate font-mono">{product.code}</span>],
    [t.group, product.category_name],
    [t.family, catalog.family(product.family)],
    [t.surface, catalog.surface(product.surface)],
    [t.thicknesses, `${list(thicknesses, lang)} ${dict.catalog.mm}`],
  ] as const;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.code,
    description: product.short,
    category: product.category_name,
    brand: { '@type': 'Brand', name: settings.company_name },
    url: `${siteUrl()}${href(`/products/${product.slug}`)}`,
    ...(product.image ? { image: `${siteUrl()}${mediaUrl(product.image)}` } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />

      <section className="mx-auto max-w-7xl px-4 pt-4 pb-12 sm:px-6 sm:pt-12 sm:pb-16 lg:px-8 lg:pb-24">
        {/* On a phone the trail is just the way back to the group. */}
        <Link
          href={href(`/categories/${product.category_slug}`)}
          className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-600 sm:hidden"
        >
          <ChevronRight className="dir-icon size-4" />
          {product.category_name}
        </Link>
        <nav aria-label={dict.catalog.breadcrumb} className="mb-6 hidden text-sm text-ink-500 sm:block">
          <Link href={href('/')} className="hover:text-ink-950">
            {dict.home}
          </Link>
          <span className="mx-2">/</span>
          <Link href={href(`/categories/${product.category_slug}`)} className="hover:text-ink-950">
            {product.category_name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink-800">{product.name}</span>
        </nav>

        <div className="grid gap-5 sm:gap-8 lg:grid-cols-2 lg:gap-14">
          <div className="self-start lg:sticky lg:top-28">
            <Tilt max={5} className="rounded-2xl">
              <div className="aspect-square overflow-hidden rounded-2xl shadow-[var(--shadow-lift)]">
                <Swatch
                  color={product.color_hex}
                  texture={catalog.texture(product.family)}
                  seed={product.id}
                  image={product.image}
                  alt={product.name}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  priority
                />
              </div>
            </Tilt>
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              <Badge>{catalog.family(product.family)}</Badge>
              <Badge>{catalog.surface(product.surface)}</Badge>
            </div>
            <h1 className="mt-3 text-h2 font-black text-balance text-ink-950 sm:mt-4 sm:text-h1">{product.name}</h1>
            <p className="mt-3 text-ink-600 sm:mt-4 sm:text-lead">{product.description || product.short}</p>

            <dl className="mt-6 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
              {specs.map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                  <dt className="text-ink-500">{term}</dt>
                  <dd className="font-bold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>

            <ul className="mt-6 grid grid-cols-2 gap-3">
              {t.features.map((label, i) => {
                const Icon = FEATURE_ICONS[i] ?? Sparkles;
                return (
                  <li key={label} className="flex items-center gap-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-800">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-gold-700 shadow-[var(--shadow-soft)]">
                      <Icon className="size-4.5" />
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>

            <div id="quote" className="mt-8 scroll-mt-20 sm:mt-10 sm:scroll-mt-28 rounded-2xl bg-ink-950 p-5 sm:p-8">
              <h2 className="text-h3 font-bold text-paper">{t.quoteTitle}</h2>
              <p className="mt-1 mb-6 text-sm text-ink-300">{t.quoteLead}</p>
              <LeadForm kind="quote" product={product.slug} dark />
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="bg-ink-50 py-12 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <h2 className="text-h2 font-black text-ink-950">{t.related}</h2>
            </Reveal>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {related.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} locale={lang} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <QuoteBar phone={settings.contact_phone} />
    </>
  );
}
