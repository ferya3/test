<?php

declare(strict_types=1);

use Database\Seeders\PageSeeder;
use Database\Seeders\SettingSeeder;

/**
 * The header menu, in the order the client asked for.
 */
beforeEach(function (): void {
    $this->seed([SettingSeeder::class, PageSeeder::class]);
});

it('lists the primary menu in the agreed order', function (): void {
    $html = $this->get('/')->assertOk()->getContent();

    // Read positions out of the rendered header rather than out of the config,
    // so this fails if the template stops honouring the order too.
    $nav = substr($html, strpos($html, '<header'), strpos($html, '</header>') - strpos($html, '<header'));

    $expected = [
        __('nav.home'),
        __('nav.products'),
        __('nav.projects'),
        __('nav.articles'),
        __('nav.representatives'),
        __('nav.about'),
        __('nav.contact'),
    ];

    $positions = [];

    foreach ($expected as $label) {
        $at = strpos($nav, $label);

        expect($at)->not->toBeFalse("The header does not contain the menu item '{$label}'.");

        $positions[$label] = $at;
    }

    $sorted = $positions;
    asort($sorted);

    expect(array_keys($sorted))->toBe($expected);
});

it('calls the projects link what the client calls it', function (): void {
    /*
     * Scoped to the header. Only the menu label was renamed — the projects
     * page still headlines itself "پروژه‌ها", as do the admin resource and the
     * enum, and changing those was not asked for.
     *
     * Asserted on the rendered page rather than through __(), because the
     * request resolves to fa while the test process sits on the fallback.
     */
    $html = $this->get('/')->assertOk()->getContent();
    $header = substr($html, strpos($html, '<header'), strpos($html, '</header>') - strpos($html, '<header'));

    expect($header)->toContain('نمونه‌های اجرا شده');
});

it('keeps the pages dropped from the header reachable from the footer', function (): void {
    /*
     * Flattening the menu removed the "products" and "factory" dropdowns, and
     * with them the only header links to these pages. They are all still
     * routed; this is the check that they are still findable.
     */
    $html = $this->get('/')->assertOk()->getContent();
    $footer = substr($html, strpos($html, '<footer'));

    foreach (['/categories', '/colors-and-decor', '/catalog', '/production-process', '/quality-control', '/certificates'] as $path) {
        expect($footer)->toContain('href="'.url($path).'"');
    }
});
