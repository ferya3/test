import type { Metadata } from 'next';
import { Award, Factory, FlaskConical, Truck } from 'lucide-react';
import { Intro } from '@/components/home/intro';
import { Process } from '@/components/home/process';
import { Cta } from '@/components/home/cta';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from '@/components/site/section-heading';
import { countProducts, getProcessSteps, getCategories, getSettings } from '@/lib/queries';
import { persianYear } from '@/lib/catalog';
import { pageMetadata } from '@/lib/metadata';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

type Props = { params: Promise<{ lang: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const s = getSettings(lang);
  const t = getDictionary(lang).about;
  return pageMetadata({ lang, path: '/about', brand: s.company_name, title: t.metaTitle, description: t.metaDescription });
}

// In the order of the dictionary's `about.values`.
const VALUE_ICONS = [Factory, FlaskConical, Truck, Award];

export default async function AboutPage({ params }: Props) {
  const { lang } = await params;
  const t = getDictionary(lang);
  const s = getSettings(lang);
  const founded = parseInt(s.founded_year, 10);
  const years = Number.isFinite(founded) && founded < persianYear() ? persianYear() - founded : 0;

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-paper">
        <div aria-hidden className="absolute -top-1/2 end-0 size-[40rem] rounded-full bg-gold-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-24 lg:px-8">
          <p className="mb-3 text-sm font-bold text-gold-300">{t.about.overline}</p>
          <h1 className="max-w-3xl text-h1 font-black text-balance sm:text-display">
            {s.company_name}{lang === 'fa' ? '،' : ','} <span className="gold-text">{s.company_tagline}</span>
          </h1>
        </div>
      </section>

      <Intro
        overline={s.intro_overline}
        heading={s.intro_heading}
        body={s.intro_body}
        stats={[
          ...(years ? [{ value: years, suffix: '+', label: t.stats.years }] : []),
          { value: countProducts(), label: t.stats.designs },
          { value: getCategories().length, label: t.stats.groups },
        ]}
      />

      <section className="bg-ink-50 py-14 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading overline={t.about.whyOverline} title={t.about.whyTitle} />
          </Reveal>
          <ul className="mt-7 grid gap-3 sm:mt-10 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.about.values.map(({ title, body }, i) => {
              const Icon = VALUE_ICONS[i] ?? Award;
              return (
              <li key={title}>
                <Reveal delay={i * 0.08} className="h-full rounded-2xl border border-ink-100 bg-white p-6 shadow-[var(--shadow-soft)]">
                  <span className="grid size-12 place-items-center rounded-xl bg-gold-50 text-gold-700">
                    <Icon className="size-6" />
                  </span>
                  <h3 className="mt-5 text-h3 font-bold text-ink-950">{title}</h3>
                  <p className="mt-2 leading-8 text-ink-600">{body}</p>
                </Reveal>
              </li>
              );
            })}
          </ul>
        </div>
      </section>

      <Process steps={getProcessSteps(lang)} />
      <div className="pt-14 sm:pt-20 lg:pt-28">
        <Cta phone={s.contact_phone} locale={lang} />
      </div>
    </>
  );
}
