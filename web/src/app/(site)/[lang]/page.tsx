import type { Metadata } from 'next';
import { Hero } from '@/components/home/hero';
import { Intro } from '@/components/home/intro';
import { Groups } from '@/components/home/groups';
import { Process } from '@/components/home/process';
import { Featured } from '@/components/home/featured';
import { Cta } from '@/components/home/cta';
import { Projects } from '@/components/home/projects';
import { countProducts, getProcessSteps, getProjects, getCategoriesWithStats, getFeaturedProducts, getSettings } from '@/lib/queries';
import { persianYear } from '@/lib/catalog';
import { alternates, jsonLd, siteUrl } from '@/lib/seo';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

type Props = { params: Promise<{ lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { alternates: alternates((await params).lang, '/') };
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;
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

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.company_name,
    description: settings.company_tagline,
    url: `${siteUrl()}${localePath(lang, '/')}`,
    telephone: settings.contact_phone,
    email: settings.contact_email,
    address: { '@type': 'PostalAddress', streetAddress: settings.contact_address, addressCountry: 'IR' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />
      <Hero
        overline={settings.hero_overline}
        title={settings.hero_title}
        lead={settings.hero_lead}
        phone={settings.contact_phone}
        panels={featured.slice(0, 4).map((p) => ({ color: p.color_hex, family: p.family }))}
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
