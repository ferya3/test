import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectGallery } from '@/components/projects/gallery';
import { getCategories, getProjects } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alternates } from '@/lib/seo';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

type Props = { params: Promise<{ lang: Locale }>; searchParams: Promise<{ group?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = getDictionary(lang).projects;
  return { title: t.metaTitle, description: t.metaDescription, alternates: alternates(lang, '/projects') };
}

export default async function ProjectsPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const t = getDictionary(lang).projects;
  const categories = getCategories(lang);
  const { group } = await searchParams;
  // Only a real group's slug filters; anything else shows everything.
  const active = categories.find((c) => c.slug === group)?.slug;
  const projects = getProjects({ categorySlug: active, lang });

  const tabs = [{ slug: undefined, name: t.allTab }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))];

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-paper">
        <div aria-hidden className="absolute -top-1/2 end-0 size-[40rem] rounded-full bg-gold-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-20 lg:px-8">
          <p className="mb-3 text-sm font-bold text-gold-300">{t.pageOverline}</p>
          <h1 className="max-w-3xl text-h1 font-black text-balance">
            {t.pageTitleA} <span className="gold-text">{t.pageTitleB}</span>
          </h1>
          <p className="mt-3 max-w-2xl text-ink-300 sm:mt-4 sm:text-lead">
            {t.pageLead}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-14 lg:px-8">
        <nav aria-label={t.groupTabs} className="mb-6 flex w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[var(--shadow-soft)] [scrollbar-width:none] sm:mb-8 sm:inline-flex sm:w-auto">
          {tabs.map((tab) => {
            const current = tab.slug === active;
            return (
              <Link
                key={tab.name}
                href={localePath(lang, tab.slug ? `/projects?group=${tab.slug}` : '/projects')}
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-bold whitespace-nowrap transition-colors sm:flex-none sm:px-4 sm:py-2',
                  current ? 'bg-ink-950 text-paper' : 'text-ink-600 hover:text-ink-950',
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>

        {projects.length > 0 ? (
          <ProjectGallery projects={projects} />
        ) : (
          <p className="rounded-2xl border border-dashed border-ink-200 px-6 py-16 text-center text-ink-500">
            {t.empty}
          </p>
        )}
      </section>
    </>
  );
}
