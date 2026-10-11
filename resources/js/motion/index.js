/*
 * Motion entry point.
 *
 * Effects are declared in markup — data-motion="reveal" and friends — and
 * implemented once, in ./effects.js. A template never imports GSAP or writes a
 * tween; it asks for an effect by name, and changing what that effect does
 * changes it everywhere at once.
 *
 * GSAP is loaded only when a page asks for an effect and the visitor has not
 * asked the operating system to reduce motion. Everything is visible in the
 * HTML before any of this runs, so a visitor who gets no animation — no
 * JavaScript, reduced motion, a failed chunk — gets the finished page rather
 * than a blank one.
 */

const SELECTOR = '[data-motion]';

export function initMotion(root = document) {
    if (root.querySelector(SELECTOR) === null) {
        return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    // A separate chunk: pages with nothing to animate never download GSAP.
    import('./effects.js')
        .then(({ startMotion }) => startMotion(root))
        .catch(() => {
            // Decoration only. The page is already complete without it.
        });
}
