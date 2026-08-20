<?php

declare(strict_types=1);

use Database\Seeders\SettingSeeder;

/**
 * The light/dark switch and the language switcher are built but not wanted on
 * the public site yet, so they are behind config flags rather than deleted.
 */
beforeEach(function (): void {
    $this->seed([SettingSeeder::class]);
});

it('hides the theme toggle and pins the page to the light theme', function (): void {
    /*
     * Hiding the control is not enough on its own. The palette also follows
     * prefers-color-scheme, so without data-theme="light" a visitor whose
     * phone is in dark mode still gets a dark site — and now with no way back,
     * because the control that would have changed it is gone.
     */
    config(['features.theme_toggle' => false]);

    $this->get('/')
        ->assertOk()
        ->assertSee('data-theme="light"', escape: false)
        ->assertSee('name="color-scheme" content="light"', escape: false)
        ->assertDontSee("localStorage.getItem('theme')", escape: false);
});

it('shows the theme toggle again when the flag is on', function (): void {
    config(['features.theme_toggle' => true]);

    $this->get('/')
        ->assertOk()
        ->assertDontSee('data-theme="light"', escape: false)
        ->assertSee("localStorage.getItem('theme')", escape: false);
});

it('takes the language switcher off the page', function (): void {
    config(['features.language_switcher' => false]);

    $html = $this->get('/')->assertOk()->getContent();

    expect($html)->not->toContain('aria-label="'.__('ui.language').'"')
        ->and($html)->not->toContain('>English<');
});

it('leaves the English pages mounted and valid', function (): void {
    /*
     * Only the switcher is withdrawn. The English pages are translated and
     * working, so they keep answering, keep their hreflang alternates and stay
     * in the sitemap — half-retiring a language that still resolves would tell
     * crawlers something untrue about the site. Retiring it properly is a
     * separate decision.
     */
    config(['features.language_switcher' => false]);

    $this->get('/en')->assertOk();
    $this->get('/')->assertOk()->assertSee('hreflang="en"', escape: false);
});

it('shows the switcher again when the flag is on', function (): void {
    config(['features.language_switcher' => true]);

    $html = $this->get('/')->assertOk()->getContent();

    expect($html)->toContain('>English<');
});
