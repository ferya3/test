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
it('frames the home hero at the 1920x1080 ratio it is authored for', function (): void {
    // A photograph shot at 1920x1080 fills this exactly, with nothing cropped.
    $this->get('/')
        ->assertOk()
        ->assertSee('aspect-[1920/1080]', escape: false);
});

it('keeps the wide hero usable at both extremes', function (): void {
    // 16:9 is about 220px tall on a phone, which will not hold a heading, a
    // lead and two buttons; and it runs past the screen on an ultrawide.
    $this->get('/')
        ->assertOk()
        ->assertSee('min-h-[52svh]', escape: false)
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
    // `wide` is set on the home page, not in the component's default, so a
    // change to the landing page cannot silently re-frame every hero on the
    // site.
    $this->get('/products')
        ->assertOk()
        ->assertDontSee('aspect-[1920/1080]', escape: false);
});
