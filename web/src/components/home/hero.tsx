'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Swatch } from '@/components/catalog/swatch';
import type { ScenePanel } from './hero-scene';
import { useLocale } from '@/i18n/client';

// WebGL exists only in the browser, and only from tablet width up (below).
const HeroScene = dynamic(() => import('./hero-scene'), {
  ssr: false,
  loading: () => <SwatchFan panels={[]} />,
});

/**
 * The same sample sheets as the 3D scene, as a fan of flat cards drifting
 * gently in CSS. This is what phones get: three.js is ~750 KB of JavaScript
 * to download and parse, which on a mid-range phone on a mobile network
 * costs seconds before the page settles. It is also the server-rendered
 * picture everyone sees before the 3D scene loads on larger screens.
 */
function SwatchFan({ panels }: { panels: ScenePanel[] }) {
  return (
    <div aria-hidden className="relative mx-auto h-full max-w-sm">
      {panels.map((panel, i) => {
        const offset = i - (panels.length - 1) / 2;
        // Anchored with a physical `left`: `start` flips to the right in RTL
        // and the centring below would land a card's width off.
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[80%] w-[27%] animate-[drift_6s_ease-in-out_infinite]"
            style={{
              transform: `translate(calc(${offset * 60}% - 50%), -50%) rotate(${offset * 6}deg)`,
              transformOrigin: '50% 100%',
              animationDelay: `${i * -1.4}s`,
              zIndex: 10 - Math.round(Math.abs(offset)),
            }}
          >
            <div className="size-full overflow-hidden rounded-lg shadow-[0_24px_40px_-14px_rgb(0_0_0/0.75)] ring-1 ring-gold-400/40">
              <Swatch color={panel.color} family={panel.family} seed={i + 3} alt="" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** True once mounted on a screen wide enough for the 3D scene. */
function useWideScreen() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
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
  const wide = useWideScreen();
  const { t, path } = useLocale();
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

      <div className="mx-auto grid max-w-7xl items-center gap-2 px-4 pt-8 pb-6 sm:gap-4 sm:px-6 sm:pt-12 sm:pb-10 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-16">
        <div className="relative z-10 max-w-xl">
          <motion.p
            {...from(0)}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3.5 py-1 text-xs text-gold-300 sm:mb-5 sm:text-sm"
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

          <motion.p {...from(0.45)} className="mt-4 max-w-lg text-lead text-ink-300 sm:mt-6">
            {lead}
          </motion.p>

          <motion.div {...from(0.6)} className="mt-7 flex gap-3 sm:mt-9">
            <Button asChild size="lg" className="flex-1 sm:flex-none">
              <Link href={path('/categories/hpl-cabinet-panel')}>
                {t.hero.viewProducts}
                <ArrowLeft className="dir-icon" />
              </Link>
            </Button>
            {/* On a phone the call button is just the icon, beside the main action. */}
            <Button asChild size="lg" variant="ghostLight" className="w-13 px-0 sm:w-auto sm:px-8">
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`${t.hero.call}: ${phone}`}>
                <Phone />
                <span className="ltr-isolate hidden sm:inline">{phone}</span>
              </a>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.2, ease }}
          className="relative h-56 sm:h-[28rem] lg:h-[36rem]"
        >
          {wide ? <HeroScene panels={panels} /> : <SwatchFan panels={panels} />}
        </motion.div>
      </div>
    </section>
  );
}
