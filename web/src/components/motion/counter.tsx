'use client';

import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { num } from '@/lib/catalog';
import { useLocale } from '@/i18n/client';

/**
 * A number that counts up when it first scrolls into view.
 *
 * The final value is server-rendered, so it is what search engines, screen
 * readers and anyone without JavaScript get; the count-up only replays it.
 * The text node is written directly rather than through state so the
 * animation does not re-render React sixty times a second.
 */
export function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const { locale } = useLocale();

  useEffect(() => {
    const node = ref.current;
    if (!inView || reduce || !node) return;

    const controls = animate(0, value, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = num(Math.round(v), locale) + suffix;
      },
    });

    return () => controls.stop();
  }, [inView, reduce, value, suffix, locale]);

  return (
    <span ref={ref} className="tabular-nums">
      {num(value, locale) + suffix}
    </span>
  );
}
