'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Layers, Flame, Gauge, Ruler, ShieldCheck } from 'lucide-react';
import { faDigits } from '@/lib/catalog';
import { mediaUrl } from '@/lib/media';
import { ProcessArt } from '@/components/illustrations';

gsap.registerPlugin(ScrollTrigger, useGSAP);

// One icon per step, in order; the text and photo come from the admin.
const ICONS = [Layers, Gauge, Flame, Ruler, ShieldCheck];

export type ProcessCard = { position: number; title: string; body: string; image: string | null };

/**
 * The production process as a horizontal strip pinned to the viewport: the
 * page scrolls down, the steps slide sideways.
 *
 * Desktop only, and only for those who have not asked for reduced motion. On
 * a phone, scroll-jacking a narrow screen is disorienting, so there the strip
 * is a plain swipeable row with snap points — the same content, native
 * gestures.
 */
export function Process({ steps }: { steps: ProcessCard[] }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const el = track.current!;
        // In RTL the overflow lies to the left, so the strip travels right —
        // far enough to bring the last card in with the same margin the first
        // had. Measured from the cards themselves: scrollWidth leaves out the
        // inline-end padding in RTL and would stop a card short.
        const distance = () => {
          const last = el.lastElementChild as HTMLElement;
          const margin = parseFloat(getComputedStyle(el).paddingLeft);

          return Math.max(0, el.getBoundingClientRect().left + margin - last.getBoundingClientRect().left);
        };

        gsap.to(el, {
          x: () => distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section.current,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        gsap.from('[data-step]', {
          opacity: 0.25,
          scale: 0.94,
          stagger: 0.12,
          scrollTrigger: { trigger: section.current, start: 'top 70%', end: 'top top', scrub: true },
        });
      });

      return () => mm.revert();
    },
    { scope: section },
  );

  return (
    <section ref={section} className="relative overflow-hidden bg-ink-950 py-14 text-paper sm:py-20 lg:flex lg:h-dvh lg:flex-col lg:justify-center lg:pt-20 lg:pb-0">
      <div aria-hidden className="absolute bottom-0 start-1/3 size-[36rem] translate-y-1/2 rounded-full bg-gold-500/10 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-3 text-sm font-bold tracking-wide text-gold-300">فرآیند تولید</p>
        <h2 className="max-w-2xl text-h2 font-black text-balance">از کاغذ تا ورق، در پنج مرحله</h2>
      </div>

      <ol
        ref={track}
        className="relative mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:mt-10 sm:px-6 lg:mt-14 lg:snap-none lg:gap-6 lg:overflow-visible lg:px-[max(2rem,calc((100%-80rem)/2+2rem))]"
      >
        {steps.map((step, i) => {
          const Icon = ICONS[i % ICONS.length]!;

          return (
            <li
              key={step.position}
              data-step
              className="group relative aspect-[3/4] w-[78vw] max-w-sm shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] sm:w-80 lg:aspect-auto lg:h-[min(32rem,calc(100dvh-20rem))] lg:w-[min(24rem,calc((100dvh-20rem)*0.75))] lg:max-w-none"
            >
              {/* The photo — or, until one is uploaded, a drawing of the step. */}
              <div className="absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-out-expo)] group-hover:scale-105">
                {step.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- already a sized WebP from sharp
                  <img src={mediaUrl(step.image)} alt={step.title} loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <ProcessArt position={step.position} />
                )}
              </div>

              {/* Dark from the bottom up, so the text reads on any photo. */}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950 from-25% via-ink-950/70 via-50% to-transparent to-75%" />

              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 lg:p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-gold-400 text-ink-950 shadow-[var(--shadow-gold)]">
                  <Icon className="size-5" />
                </span>
                <span className="rounded-full bg-ink-950/60 px-3 py-1 text-sm font-bold text-gold-300 backdrop-blur-sm">
                  مرحلهٔ {faDigits(i + 1)}
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-0 p-5 lg:p-7">
                <h3 className="text-h3 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-200 lg:text-base lg:leading-8">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
