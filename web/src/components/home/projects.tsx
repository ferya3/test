import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeading } from '@/components/site/section-heading';
import { Button } from '@/components/ui/button';
import { ProjectGallery } from '@/components/projects/gallery';
import type { Project } from '@/lib/queries';

/** Completed projects on the home page: the first six, the first one large. */
export function Projects({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;

  return (
    <section className="bg-ink-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            overline="نمونه‌های اجرا شده"
            title="ورق‌های ما، در کار"
            lead="آشپزخانه‌ها، کمدها و سرویس‌های بهداشتی که با صفحه کابینت و کامپکت ما ساخته شده‌اند."
          />
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/projects">
              همهٔ نمونه کارها
              <ArrowLeft />
            </Link>
          </Button>
        </Reveal>

        <Reveal delay={0.1} className="mt-10 lg:mt-14">
          <ProjectGallery projects={projects} layout="bento" />
        </Reveal>

        <Button asChild variant="outline" className="mt-6 w-full sm:hidden">
          <Link href="/projects">
            همهٔ نمونه کارها
            <ArrowLeft />
          </Link>
        </Button>
      </div>
    </section>
  );
}
