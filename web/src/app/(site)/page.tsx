import { Hero } from '@/components/home/hero';
import { Intro } from '@/components/home/intro';
import { Groups } from '@/components/home/groups';
import { Process } from '@/components/home/process';
import { Featured } from '@/components/home/featured';
import { Cta } from '@/components/home/cta';
import { Projects } from '@/components/home/projects';
import { countProducts, getProcessSteps, getProjects, getCategoriesWithStats, getFeaturedProducts, getSettings } from '@/lib/queries';
import { persianYear } from '@/lib/catalog';
import { jsonLd, siteUrl } from '@/lib/seo';

export default function HomePage() {
  const settings = getSettings();
  const categories = getCategoriesWithStats();
  const featured = getFeaturedProducts(6);
  const founded = parseInt(settings.founded_year, 10);

  const stats = [
    ...(Number.isFinite(founded) && founded < persianYear()
      ? [{ value: persianYear() - founded, label: 'سال تجربه در تولید ورق اچ‌پی‌ال', suffix: '+' }]
      : []),
    { value: countProducts(), label: 'طرح و رنگ' },
    { value: categories.length, label: 'گروه کالا' },
  ];

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.company_name,
    description: settings.company_tagline,
    url: siteUrl(),
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
      <Groups categories={categories} />
      <Process steps={getProcessSteps()} />
      <Featured products={featured} />
      <Projects projects={getProjects({ limit: 6 })} />
      <Cta phone={settings.contact_phone} />
    </>
  );
}
