'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Layers, Flame, Gauge, Ruler, ShieldCheck } from 'lucide-react';
import { faDigits } from '@/lib/catalog';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS = [
  {
    icon: Layers,
    title: 'آغشته‌سازی کاغذ',
    body: 'کاغذ کرافت در رزین فنولیک و کاغذ دکور در رزین ملامین غوطه‌ور و خشک می‌شود.',
  },
  {
    icon: Gauge,
    title: 'چیدمان لایه‌ها',
    body: 'لایه‌ها به تعداد لازم برای هر ضخامت روی هم چیده می‌شوند؛ دکور و لایهٔ محافظ در رو.',
  },
  {
    icon: Flame,
    title: 'پرس فشار بالا',
    body: 'زیر فشار بیش از ۷۰ بار و دمای حدود ۱۴۰ درجه، لایه‌ها به یک ورق یکپارچه تبدیل می‌شوند.',
  },
  {
    icon: Ruler,
    title: 'برش و کالیبره',
    body: 'ورق به ابعاد استاندارد برش می‌خورد و پشت آن برای چسبندگی یکنواخت سنباده می‌شود.',
  },
  {
    icon: ShieldCheck,
    title: 'کنترل کیفیت',
    body: 'ثبات رنگ، مقاومت سایشی و ضخامت هر بچ در آزمایشگاه کارخانه اندازه‌گیری می‌شود.',
  },
];

/**
 * The production process as a horizontal strip pinned to the viewport: the
 * page scrolls down, the steps slide sideways.
 *
 * Desktop only, and only for those who have not asked for reduced motion. On
 * a phone, scroll-jacking a narrow screen is disorienting, so there the strip
 * is a plain swipeable row with snap points — the same content, native
 * gestures.
 */
export function Process() {
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
    <section ref={section} className="relative overflow-hidden bg-ink-950 py-20 text-paper lg:flex lg:h-dvh lg:flex-col lg:justify-center lg:py-0">
      <div aria-hidden className="absolute bottom-0 start-1/3 size-[36rem] translate-y-1/2 rounded-full bg-gold-500/10 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-3 text-sm font-bold tracking-wide text-gold-300">فرآیند تولید</p>
        <h2 className="max-w-2xl text-h2 font-black text-balance">از کاغذ تا ورق، در پنج مرحله</h2>
      </div>

      <ol
        ref={track}
        className="relative mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:px-6 lg:mt-14 lg:snap-none lg:gap-6 lg:overflow-visible lg:px-[max(2rem,calc((100%-80rem)/2+2rem))]"
      >
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            data-step
            className="relative flex w-[78vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:w-80 lg:w-[26rem] lg:max-w-none lg:p-8"
          >
            <span className="absolute end-6 top-4 text-6xl font-black text-white/[0.06] lg:text-8xl">{faDigits(i + 1)}</span>
            <span className="grid size-12 place-items-center rounded-xl bg-gold-400 text-ink-950">
              <Icon className="size-6" />
            </span>
            <h3 className="mt-6 text-h3 font-bold">{title}</h3>
            <p className="mt-3 leading-8 text-ink-300">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
