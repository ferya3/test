/*
 * A row of cards that scrolls sideways as the page scrolls down.
 *
 * Markup: a container with data-motion="horizontal" whose first child is the
 * track. The nearest [data-motion-pin] ancestor is pinned while the track
 * travels; without one, the container itself is.
 *
 * Desktop only — the caller decides that. Below it, and with reduced motion
 * or no JavaScript, the same markup is a native horizontal scroller with snap
 * points, which is the better interaction on a touch screen anyway.
 *
 * Direction-aware: on a right-to-left page the overflow is to the left, so the
 * track travels right.
 */
export function horizontal(container, gsap, ScrollTrigger) {
    const track = container.firstElementChild;
    if (!track) return undefined;

    const section = container.closest('[data-motion-pin]') ?? container;
    const rtl = getComputedStyle(container).direction === 'rtl';
    const distance = () => Math.max(0, track.scrollWidth - container.clientWidth);

    // Everything already fits: there is nothing to travel, so do not pin a
    // section for no reason.
    if (distance() <= 0) return undefined;

    // gsap.set rather than element.style so matchMedia's revert puts the
    // native scroller back exactly as it was.
    gsap.set(container, { overflowX: 'hidden', scrollSnapType: 'none' });
    container.scrollLeft = 0;

    const tween = gsap.to(track, {
        x: () => (rtl ? distance() : -distance()),
        ease: 'none',
        scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
        },
    });

    /*
     * Keyboard access. A card translated out of the visible window is still
     * in the tab order, and focusing it would otherwise leave the focus ring
     * somewhere off-screen. Scroll the page to the point in the pin where
     * that card is fully in view.
     */
    const onFocus = (event) => {
        const item = event.target.closest('li') ?? event.target;
        if (!track.contains(item)) return;

        const trigger = tween.scrollTrigger;
        const total = distance();
        if (!trigger || total <= 0) return;

        const start = rtl
            ? track.offsetWidth - (item.offsetLeft + item.offsetWidth)
            : item.offsetLeft;
        const shown = trigger.progress * total;
        const visible = start >= shown && start + item.offsetWidth <= shown + container.clientWidth;
        if (visible) return;

        const needed = Math.min(total, Math.max(0, start + item.offsetWidth - container.clientWidth));
        window.scrollTo({ top: trigger.start + (needed / total) * (trigger.end - trigger.start), behavior: 'instant' });
    };

    container.addEventListener('focusin', onFocus);

    return () => container.removeEventListener('focusin', onFocus);
}
