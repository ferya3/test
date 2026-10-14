import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectGallery } from '@/components/projects/gallery';
import { getCategories, getProjects } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'نمونه کارها',
  description: 'نمونه‌های اجرا شده با صفحه کابینت و کامپکت اچ‌پی‌ال.',
  alternates: { canonical: '/projects' },
};

type Props = { searchParams: Promise<{ group?: string }> };

export default async function ProjectsPage({ searchParams }: Props) {
  const categories = getCategories();
  const { group } = await searchParams;
  // Only a real group's slug filters; anything else shows everything.
  const active = categories.find((c) => c.slug === group)?.slug;
  const projects = getProjects({ categorySlug: active });

  const tabs = [{ slug: undefined, name: 'همه' }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))];

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-paper">
        <div aria-hidden className="absolute -top-1/2 end-0 size-[40rem] rounded-full bg-gold-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-20 lg:px-8">
          <p className="mb-3 text-sm font-bold text-gold-300">نمونه کارها</p>
          <h1 className="max-w-3xl text-h1 font-black text-balance">
            نمونه‌های <span className="gold-text">اجرا شده</span>
          </h1>
          <p className="mt-3 max-w-2xl text-ink-300 sm:mt-4 sm:text-lead">
            پروژه‌هایی که با صفحه کابینت و کامپکت اچ‌پی‌ال ما ساخته شده‌اند. روی هر کدام بزنید تا جزئیاتش را ببینید.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-14 lg:px-8">
        <nav aria-label="گروه کالا" className="mb-6 flex w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[var(--shadow-soft)] [scrollbar-width:none] sm:mb-8 sm:inline-flex sm:w-auto">
          {tabs.map((tab) => {
            const current = tab.slug === active;
            return (
              <Link
                key={tab.name}
                href={tab.slug ? `/projects?group=${tab.slug}` : '/projects'}
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
            هنوز نمونه کاری در این گروه ثبت نشده است.
          </p>
        )}
      </section>
    </>
  );
}
