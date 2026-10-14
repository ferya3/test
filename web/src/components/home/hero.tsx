'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScenePanel } from './hero-scene';

// WebGL exists only in the browser; the server renders the static fallback.
const HeroScene = dynamic(() => import('./hero-scene'), {
  ssr: false,
  loading: () => <SceneFallback />,
});

function SceneFallback() {
  return (
    <div className="grid size-full place-items-center">
      <div className="size-40 animate-pulse rounded-full bg-gold-400/10 blur-2xl" />
    </div>
  );
}

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero({
  overline,
  title,
  lead,
  phone,
  panels,
}: {
  overline: string;
  title: string;
  lead: string;
  phone: string;
  panels: ScenePanel[];
}) {
  const reduce = useReducedMotion();
  const words = title.split(' ');
  const from = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease } };

  return (
    <section className="relative isolate overflow-hidden bg-ink-950 text-paper">
      {/* Soft pools of light, so the dark band reads as depth rather than a flat fill. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -top-1/3 end-[-10%] size-[42rem] rounded-full bg-gold-500/15 blur-[120px]" />
        <div className="absolute bottom-[-30%] start-[-15%] size-[36rem] rounded-full bg-gold-300/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_40%,rgb(15_13_11)_100%)]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-4 px-4 pt-12 pb-10 sm:px-6 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-16">
        <div className="relative z-10 max-w-xl">
          <motion.p
            {...from(0)}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3.5 py-1 text-sm text-gold-300"
          >
            <span className="size-1.5 rounded-full bg-gold-400" />
            {overline}
          </motion.p>

          <h1 className="text-display font-black text-balance">
            {words.map((word, i) => (
              <motion.span
                key={i}
                className={i === words.length - 1 ? 'gold-text inline-block' : 'inline-block'}
                {...(reduce
                  ? {}
                  : {
                      initial: { opacity: 0, y: '0.5em', filter: 'blur(8px)' },
                      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                      transition: { duration: 0.9, delay: 0.1 + i * 0.08, ease },
                    })}
              >
                {word}
                {i < words.length - 1 && ' '}
              </motion.span>
            ))}
          </h1>

          <motion.p {...from(0.45)} className="mt-6 max-w-lg text-lead text-ink-300">
            {lead}
          </motion.p>

          <motion.div {...from(0.6)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/categories/hpl-cabinet-panel">
                مشاهدهٔ محصولات
                <ArrowLeft />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghostLight">
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                <Phone />
                <span className="ltr-isolate">{phone}</span>
              </a>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.2, ease }}
          className="relative -mx-4 h-[22rem] sm:h-[28rem] lg:mx-0 lg:h-[36rem]"
        >
          <HeroScene panels={panels} />
        </motion.div>
      </div>
    </section>
  );
}
