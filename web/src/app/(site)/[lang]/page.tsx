import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/home/hero';
import { Intro } from '@/components/home/intro';
import { Groups } from '@/components/home/groups';
import { Process } from '@/components/home/process';
import { Featured } from '@/components/home/featured';
import { Cta } from '@/components/home/cta';
import { Projects } from '@/components/home/projects';
import { countProducts, getProcessSteps, getProjects, getCategoriesWithStats, getFeaturedProducts, getSettings } from '@/lib/queries';
import { persianYear } from '@/lib/catalog';
import { catalogFor } from '@/lib/attributes';
import { jsonLd, siteUrl } from '@/lib/seo';
import { pageMetadata } from '@/lib/metadata';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale, localePath, type Locale } from '@/i18n/config';

type Props = { params: Promise<{ lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const s = getSettings(lang);
  return pageMetadata({
    lang,
    path: '/',
    brand: s.company_name,
    absoluteTitle: s.seo_home_title || `${s.company_name} | ${s.company_tagline}`,
    description: s.seo_home_description || s.hero_lead,
    image: s.hero_image || null,
  });
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;
  // Anything at the top level that is not a page or a file lands here.
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const settings = getSettings(lang);
  const categories = getCategoriesWithStats(lang);
  const featured = getFeaturedProducts(6, lang);
  const founded = parseInt(settings.founded_year, 10);

  const stats = [
    ...(Number.isFinite(founded) && founded < persianYear()
      ? [{ value: persianYear() - founded, label: t.stats.years, suffix: '+' }]
      : []),
    { value: countProducts(), label: t.stats.designs },
    { value: categories.length, label: t.stats.groups },
  ];

  // Who the site belongs to, and the site itself — what search engines use
  // for the knowledge panel and the site name shown above results.
  const base = siteUrl();
  const organization = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: settings.company_name,
        alternateName: getSettings(lang === 'fa' ? 'en' : 'fa').company_name,
        description: settings.company_tagline,
        url: `${base}${localePath(lang, '/')}`,
        logo: `${base}/logo.png`,
        image: `${base}/og-${lang}.png`,
        telephone: settings.contact_phone,
        email: settings.contact_email,
        address: { '@type': 'PostalAddress', streetAddress: settings.contact_address, addressCountry: 'IR' },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: settings.contact_phone,
          contactType: 'sales',
          availableLanguage: ['fa', 'en'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: settings.company_name,
        url: `${base}${localePath(lang, '/')}`,
        inLanguage: lang,
        publisher: { '@id': `${base}/#organization` },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />
      <Hero
        overline={settings.hero_overline}
        title={settings.hero_title}
        lead={settings.hero_lead}
        phone={settings.contact_phone}
        panels={featured.slice(0, 4).map((p) => ({ color: p.color_hex, texture: catalogFor(lang).texture(p.family) }))}
        ctaLabel={settings.hero_cta_label}
        ctaHref={settings.hero_cta_href || (categories[0] ? `/categories/${categories[0].slug}` : '/projects')}
        showPhone={settings.hero_show_phone !== '0'}
        image={settings.hero_image || null}
      />
      <Intro overline={settings.intro_overline} heading={settings.intro_heading} body={settings.intro_body} stats={stats} />
      <Groups categories={categories} locale={lang} />
      <Process steps={getProcessSteps(lang)} />
      <Featured products={featured} locale={lang} />
      <Projects projects={getProjects({ limit: 6, lang })} locale={lang} />
      <Cta phone={settings.contact_phone} locale={lang} />
    </>
  );
}
