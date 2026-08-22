<?php

declare(strict_types=1);
use App\Models\Media;
use App\Models\Setting;
use App\Services\SettingsRepository;
use Illuminate\Support\Facades\Blade;

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
    // A floor, because 16:9 is about 220px tall on a phone and will not hold a
    // heading, a lead and two buttons.
    $this->get('/')
        ->assertOk()
        ->assertSee('min-h-[52svh]', escape: false);
});

it('caps the hero at the width of the photograph rather than its height', function (): void {
    /*
     * A height cap was what cropped the image. On a 1920x1080 display the
     * viewport is around 900px, so max-h-[100svh] made the box 1920x900 —
     * wider than 16:9 — and object-cover trimmed the top and bottom off a
     * photograph that fitted the frame exactly.
     *
     * Capping the width instead keeps the ratio intact: the frame stops
     * growing at the size the image was made for, and never exceeds 1080 tall.
     */
    $this->get('/')
        ->assertOk()
        ->assertSee('max-w-[1920px]', escape: false)
        ->assertDontSee('max-h-[100svh]', escape: false);
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
    $this->get('/contact')
        ->assertOk()
        ->assertDontSee('aspect-[1920/1080]', escape: false);
});

it('makes the hero photograph cover the whole section', function (): void {
    /*
     * The hero uses the image as a backdrop, so it has no ratio of its own —
     * and cover behaviour used to hang off the `.media-frame` class that only a
     * ratio adds. Without it the image fell back to `h-auto`, which Tailwind
     * emits after `size-full` and therefore wins, so it took its intrinsic
     * height and left the rest of the section bare.
     */
    $media = Media::factory()->create(['width' => 1920, 'height' => 1080]);

    Setting::query()->updateOrCreate(
        ['key' => 'home_hero_media_id'],
        ['value' => $media->id, 'group' => 'home', 'is_public' => true],
    );

    app(SettingsRepository::class)->flush();

    $html = $this->get('/')->assertOk()->getContent();

    preg_match('/<img[^>]*fetchpriority="high"[^>]*>/s', $html, $matches);

    expect($matches)->not->toBeEmpty();

    $img = $matches[0];

    expect($img)->toContain('absolute')
        ->and($img)->toContain('inset-0')
        ->and($img)->toContain('size-full')
        ->and($img)->toContain('object-cover')
        // The utility that caused the bug. Its absence is the fix.
        ->and($img)->not->toContain('h-auto');
});

it('still lets an ordinary image size itself in the flow', function (): void {
    // `fill` must not become the default: a card image reserves its space with
    // an intrinsic height, and absolutely positioning it would collapse the
    // card. Rendered directly, because whether the homepage happens to have a
    // photographed category is not what this is about.
    $media = Media::factory()->create(['width' => 1600, 'height' => 1200]);

    $html = Blade::render(
        '<x-media.picture :media="$media" alt="" ratio="4/3" sizes="50vw" />',
        ['media' => $media],
    );

    expect($html)->toContain('block h-auto w-full')
        ->and($html)->not->toContain('absolute inset-0 size-full');
});
