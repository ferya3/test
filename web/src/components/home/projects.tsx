import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from '@/components/site/section-heading';
import { Button } from '@/components/ui/button';
import { ProjectGallery } from '@/components/projects/gallery';
import type { Project } from '@/lib/queries';
import { getDictionary } from '@/i18n/dictionaries';
import { localePath, type Locale } from '@/i18n/config';

/** Completed projects on the home page: the first six, the first one large. */
export function Projects({ projects, locale }: { projects: Project[]; locale: Locale }) {
  if (projects.length === 0) return null;
  const t = getDictionary(locale).projects;

  return (
    <section className="bg-ink-50 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading overline={t.overline} title={t.title} lead={t.lead} />
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href={localePath(locale, '/projects')}>
              {t.all}
              <ArrowLeft className="dir-icon" />
            </Link>
          </Button>
        </Reveal>

        <Reveal delay={0.1} className="mt-7 sm:mt-10 lg:mt-14">
          <ProjectGallery projects={projects} layout="bento" />
        </Reveal>

        <Button asChild variant="outline" className="mt-6 w-full sm:hidden">
          <Link href={localePath(locale, '/projects')}>
            {t.all}
            <ArrowLeft className="dir-icon" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
