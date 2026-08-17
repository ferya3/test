<?php

declare(strict_types=1);

/**
 * The portrait hero and the wave that closes it.
 *
 * Both are pure presentation, so what is worth guarding is not how they look
 * but the handful of decisions that stop them breaking the page: the ratio the
 * frame is authored at, the cap that keeps that ratio usable on a desktop, and
 * the wave staying decorative and behind the copy.
 */
it('frames the home hero at the 1080x1920 ratio it is authored for', function (): void {
    $this->get('/')
        ->assertOk()
        ->assertSee('aspect-[1080/1920]', escape: false);
});

it('caps the portrait hero at the viewport height', function (): void {
    // Without this the same ratio is over 3000px tall on a 1920px-wide screen
    // and the visitor scrolls a full page before reaching any content.
    $this->get('/')
        ->assertOk()
        ->assertSee('max-h-[100svh]', escape: false);
});

it('closes the home hero with the wave', function (): void {
    $this->get('/')
        ->assertOk()
        ->assertSee('wave-drift', escape: false);
});

it('hides the wave from assistive technology', function (): void {
    // It carries no information; a screen reader announcing three curves in the
    // middle of the hero would be pure noise.
    $response = $this->get('/')->assertOk();

    expect($response->getContent())
        ->toMatch('/aria-hidden="true"[^>]*>\s*<svg[^>]*viewBox="0 0 1440 200"/s');
});

it('paints the hero copy above the wave', function (): void {
    // The wave sits at z-0 inside the hero's own stacking context, so the
    // container has to be positioned to land on top of it. Losing this puts the
    // heading behind an opaque band.
    $this->get('/')
        ->assertOk()
        ->assertSee('relative z-10', escape: false);
});

it('leaves other pages on their own hero sizes', function (): void {
    // `portrait` is set on the home page, not in the component's default, so a
    // change to the landing page cannot silently turn every hero on the site
    // into a full-height portrait frame.
    $this->get('/products')
        ->assertOk()
        ->assertDontSee('aspect-[1080/1920]', escape: false);
});
