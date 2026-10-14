'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';
import { ProjectArt } from '@/components/illustrations';
import { lenis } from '@/components/providers/smooth-scroll';
import { mediaUrl } from '@/lib/media';
import { faDigits } from '@/lib/catalog';
import type { Project } from '@/lib/queries';
import { cn } from '@/lib/utils';

function Visual({ project, className }: { project: Project; className?: string }) {
  return project.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp
    <img src={mediaUrl(project.image)} alt={project.title} loading="lazy" decoding="async" className={cn('size-full object-cover', className)} />
  ) : (
    <div className={cn('size-full', className)} role="img" aria-label={project.title}>
      <ProjectArt color={project.color_hex} categorySlug={project.category_slug} />
    </div>
  );
}

const meta = (p: Project) => [p.location, p.year && faDigits(p.year)].filter(Boolean).join(' · ');

/**
 * Completed projects as cards that open a lightbox.
 *
 * `bento` lays the first project out large (the home page); `grid` is an even
 * grid (the projects page).
 */
export function ProjectGallery({ projects, layout = 'grid' }: { projects: Project[]; layout?: 'bento' | 'grid' }) {
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus();
  }, []);

  return (
    <>
      <ul
        className={cn(
          'grid gap-3 sm:gap-5',
          layout === 'bento'
            ? 'grid-cols-2 lg:auto-rows-[15rem] lg:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {projects.map((project, i) => {
          const big = layout === 'bento' && i === 0;

          return (
            <li
              key={project.id}
              className={cn(
                big ? 'col-span-2 lg:row-span-2' : layout === 'bento' ? 'col-span-1' : '',
                layout === 'bento' && !big && 'aspect-square lg:aspect-auto',
                big && 'aspect-[4/3] lg:aspect-auto',
                layout === 'grid' && 'aspect-[4/3]',
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setOpen(i);
                }}
                className="group relative block size-full overflow-hidden rounded-2xl bg-ink-100 text-start shadow-[var(--shadow-soft)] transition-shadow duration-500 hover:shadow-[var(--shadow-lift)]"
                aria-label={`${project.title} — نمایش جزئیات`}
              >
                <Visual project={project} className="transition-transform duration-[1.2s] ease-[var(--ease-out-expo)] group-hover:scale-105" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/25 via-45% to-transparent" />

                {project.category_name && (
                  <span className="absolute start-3 top-3 rounded-full bg-paper/90 px-2.5 py-1 text-[0.7rem] font-bold text-ink-900 backdrop-blur-sm sm:start-4 sm:top-4 sm:text-xs">
                    {project.category_name}
                  </span>
                )}

                <span className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
                  <span className={cn('block font-bold text-paper', big ? 'text-lg sm:text-h3' : 'text-sm sm:text-base')}>
                    {project.title}
                  </span>
                  {meta(project) && <span className="mt-0.5 block text-xs text-ink-200">{meta(project)}</span>}
                  {big && project.description && (
                    <span className="mt-2 hidden max-w-lg text-sm leading-7 text-ink-200 sm:block">{project.description}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Lightbox projects={projects} index={open} onIndex={setOpen} onClose={close} />
    </>
  );
}

function Lightbox({
  projects,
  index,
  onIndex,
  onClose,
}: {
  projects: Project[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const project = index === null ? null : projects[index];
  const count = projects.length;

  // In RTL "next" sits on the left: ArrowLeft moves forward.
  const step = useCallback((delta: number) => index !== null && onIndex((index + delta + count) % count), [index, count, onIndex]);

  useEffect(() => {
    if (index === null) return;

    lenis?.stop();
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') step(1);
      if (e.key === 'ArrowRight') step(-1);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      lenis?.start();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [index, onClose, step]);

  return (
    <AnimatePresence>
      {project && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={project.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/80 backdrop-blur-md sm:items-center sm:p-6"
          onClick={onClose}
          data-lenis-prevent
        >
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-paper shadow-2xl sm:rounded-2xl lg:grid lg:grid-cols-[3fr_2fr] lg:overflow-hidden"
          >
            <div className="relative aspect-[4/3] bg-ink-100 lg:aspect-auto lg:min-h-[32rem]">
              <Visual project={project} className="absolute inset-0" />
            </div>

            <div className="flex flex-col p-5 sm:p-8">
              {project.category_name && <p className="text-sm font-bold text-gold-700">{project.category_name}</p>}
              <h2 className="mt-1 text-h3 font-black text-ink-950">{project.title}</h2>
              {meta(project) && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-500">
                  <MapPin className="size-4" />
                  {meta(project)}
                </p>
              )}
              {project.description && <p className="mt-4 leading-8 whitespace-pre-line text-ink-700">{project.description}</p>}

              {project.category_slug && (
                <Link
                  href={`/categories/${project.category_slug}`}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-gold-700 hover:underline"
                >
                  محصولات {project.category_name}
                  <ArrowLeft className="size-4" />
                </Link>
              )}

              {count > 1 && (
                <div className="mt-auto flex items-center justify-between gap-3 pt-8">
                  <button type="button" onClick={() => step(-1)} className="grid size-11 place-items-center rounded-full border border-ink-200 text-ink-800 hover:bg-ink-50" aria-label="قبلی">
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="text-sm text-ink-500 tabular-nums">
                    {faDigits((index ?? 0) + 1)} از {faDigits(count)}
                  </span>
                  <button type="button" onClick={() => step(1)} className="grid size-11 place-items-center rounded-full border border-ink-200 text-ink-800 hover:bg-ink-50" aria-label="بعدی">
                    <ChevronLeft className="size-5" />
                  </button>
                </div>
              )}
            </div>

            <button
              ref={closeButton}
              type="button"
              onClick={onClose}
              className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-ink-950/70 text-paper backdrop-blur-sm hover:bg-ink-950"
              aria-label="بستن"
            >
              <X className="size-5" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
