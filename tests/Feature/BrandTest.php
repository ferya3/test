<?php

declare(strict_types=1);

use App\Models\Setting;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use App\Services\SettingsRepository;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * The company name is a setting, not a constant.
 *
 * Every one of these places was previously bound to `config('app.name')`, which
 * is the framework's name for the application — so a site that had entered its
 * own company details still said "Laravel" in the wordmark, the browser tab and
 * the authenticator app.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class]);
});

/** Renames the company and clears the cached settings blob. */
function renameCompany(string $fa, string $en): void
{
    Setting::query()->where('key', 'company_name')->firstOrFail()
        ->forceFill(['value' => ['fa' => $fa, 'en' => $en]])->save();

    app(SettingsRepository::class)->flush();
}

it('shows the company name in the wordmark and the page title', function (): void {
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)->toContain('آرتاویل گلد')
        ->and($html)->not->toContain('Laravel');
});

it('uses the English name on the English site', function (): void {
    $html = $this->get('/en')->assertOk()->getContent();

    expect($html)->toContain('Artavil Gold');
});

it('follows a rename rather than hard-coding the current name', function (): void {
    // The real assertion: this is data, not a string in a template.
    renameCompany('نام تازه', 'New Name');

    expect($this->get('/')->assertOk()->getContent())->toContain('نام تازه')
        ->and($this->get('/en')->assertOk()->getContent())->toContain('New Name');
});

it('labels the authenticator entry with the company, not the framework', function (): void {
    // A locked-out administrator scrolling their authenticator app needs to
    // recognise the entry; "Laravel" tells them nothing.
    $user = User::factory()->admin()->create();
    $uri = app(TwoFactorService::class)->provisioningUri($user, 'ABCDEFGHIJKLMNOP');

    expect($uri)->toContain(rawurlencode('آرتاویل گلد'))
        ->and($uri)->not->toContain('Laravel');
});

it('keeps the authenticator issuer stable across locales', function (): void {
    // The issuer is part of the account's identity in the authenticator app.
    // Resolving it from the request locale would give an admin enrolling on the
    // English site a different entry for the same account.
    $user = User::factory()->admin()->create();
    $service = app(TwoFactorService::class);

    $fa = $service->provisioningUri($user, 'ABCDEFGHIJKLMNOP');

    app()->setLocale('en');
    $en = $service->provisioningUri($user, 'ABCDEFGHIJKLMNOP');

    expect($en)->toBe($fa);
});

it('keeps the monogram to one whole character', function (): void {
    // mb_substr, not substr: a Persian name cut at one byte renders a
    // replacement character in the header badge.
    $html = $this->get('/')->assertOk()->getContent();

    expect($html)->toContain('>آ</span>')
        ->and($html)->not->toContain('�');
});

it('carries no trace of the previous brand in seeded content', function (): void {
    foreach (['/', '/en', '/categories/hpl-cabinet-panel', '/representatives'] as $path) {
        expect($this->get($path)->assertOk()->getContent())
            ->not->toContain('آرکا')
            ->not->toContain('Arka');
    }
});
