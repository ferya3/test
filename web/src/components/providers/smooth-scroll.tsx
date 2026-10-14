'use client';

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, type ReactNode } from 'react';

gsap.registerPlugin(ScrollTrigger);

/** The running Lenis instance, so the mobile menu can pause scrolling. */
export let lenis: Lenis | null = null;

/**
 * Smooth scroll, driven by GSAP's ticker.
 *
 * Lenis and ScrollTrigger each want to own the frame loop. Running Lenis off
 * gsap.ticker and telling ScrollTrigger on every Lenis scroll keeps them on
 * the same frame — otherwise pinned sections lag a frame behind and visibly
 * judder against the page.
 *
 * Skipped entirely for anyone who prefers reduced motion: smooth scrolling is
 * precisely the kind of movement that setting asks to turn off.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const instance = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis = instance;

    instance.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis = null;
    };
  }, []);

  return <>{children}</>;
}
