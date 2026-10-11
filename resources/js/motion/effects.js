import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { horizontal } from './horizontal.js';

gsap.registerPlugin(ScrollTrigger);

/*
 * The vocabulary, in one place. Durations are longer than the 300ms ceiling
 * on interface feedback (hover, focus, open/close) because these are not
 * feedback: they pace content arriving as the reader scrolls. Transform and
 * opacity only, so nothing here triggers layout.
 */
const REVEAL = { y: 28, opacity: 0, duration: 0.8, ease: 'power3.out' };
const STAGGER = 0.08;
const ENTER = 'top 85%';

/**
 * Content the reader can already see is never hidden and brought back: on a
 * page opened halfway down, or a short page, the first screen would flash
 * empty and then fill in, which reads as broken rather than designed.
 */
function alreadyVisible(element) {
    return ScrollTrigger.isInViewport(element, 0.1);
}

const effects = {
    reveal(element) {
        if (alreadyVisible(element)) return;

        gsap.from(element, {
            ...REVEAL,
            scrollTrigger: { trigger: element, start: ENTER, once: true },
        });
    },

    stagger(element) {
        if (alreadyVisible(element)) return;

        const items = Array.from(element.children);
        if (items.length === 0) return;

        gsap.from(items, {
            ...REVEAL,
            stagger: STAGGER,
            scrollTrigger: { trigger: element, start: ENTER, once: true },
        });
    },

    /*
     * Counts a figure up from zero. The markup holds the finished number, in
     * the inner value span of <x-ui.measure>; it is read, animated, and
     * written back in the same shape — "1,500" stays grouped, "1998" does not
     * gain a separator.
     */
    counter(element) {
        if (alreadyVisible(element)) return;

        const target = element.querySelector('[dir]') ?? element;
        const original = target.textContent.trim();
        const value = Number(original.replace(/,/g, ''));

        if (!Number.isFinite(value) || value <= 0 || !/^[\d,]+$/.test(original)) return;

        const grouped = original.includes(',');
        const format = (n) => (grouped ? Math.round(n).toLocaleString('en-US') : String(Math.round(n)));
        const state = { n: 0 };

        target.textContent = format(0);

        gsap.to(state, {
            n: value,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
                target.textContent = format(state.n);
            },
            // Whatever happens to the tween, the page ends on the real figure.
            onComplete: () => {
                target.textContent = original;
            },
            onInterrupt: () => {
                target.textContent = original;
            },
            scrollTrigger: { trigger: element, start: ENTER, once: true },
        });

        return () => {
            target.textContent = original;
        };
    },

    /*
     * The image drifts down at a quarter of the scroll speed. Only ever down
     * and only ever less than the distance scrolled, so the edge it uncovers
     * is always above the viewport — no scale-up is needed to hide a gap, and
     * nothing jumps when the page loads.
     */
    parallax(element) {
        const image = element.querySelector('img') ?? element;
        const section = element.closest('section') ?? element;

        gsap.to(image, {
            yPercent: 25,
            ease: 'none',
            scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
        });
    },
};

export function startMotion(root = document) {
    const mm = gsap.matchMedia();

    /*
     * gsap.matchMedia scopes every tween and ScrollTrigger created inside the
     * callback to these conditions, and reverts all of them — inline styles
     * included — when a condition stops matching: the visitor turns on reduced
     * motion mid-visit, or a window is narrowed past the desktop breakpoint.
     * Nothing has to be torn down by hand, and no stale trigger survives a
     * resize.
     */
    mm.add(
        {
            motion: '(prefers-reduced-motion: no-preference)',
            wide: '(min-width: 1024px)',
        },
        (context) => {
            const { motion, wide } = context.conditions;
            if (!motion) return undefined;

            const cleanups = [];

            root.querySelectorAll('[data-motion]').forEach((element) => {
                const name = element.dataset.motion;

                if (name === 'horizontal') {
                    if (wide) cleanups.push(horizontal(element, gsap, ScrollTrigger));
                    return;
                }

                const effect = effects[name];
                if (effect) cleanups.push(effect(element));
            });

            return () => cleanups.forEach((cleanup) => cleanup?.());
        },
    );

    // Web fonts arriving change line breaks and therefore every trigger's
    // position; measure again once they have.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
}
