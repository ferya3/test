<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Setting;
use App\Models\User;
use App\Services\SettingsRepository;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * Settings are the one resource edited as a whole rather than row by row, so
 * the panel authorises with a class name. Gate strips that argument before
 * calling the policy, which left ResourcePolicy::update() — declared with a
 * required Model — invoked with only the user, and every save returned 500.
 *
 * Nothing caught it: every other resource authorises against a record it has
 * just loaded, so the settings screen was the only caller taking that path.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class]);
});

it('saves a scalar setting', function (): void {
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->put('/admin/settings', ['settings' => ['founded_year' => '1997']])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect(Setting::query()->where('key', 'founded_year')->value('value'))->toBe('1997');
});

it('saves a translated setting for both locales', function (): void {
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->put('/admin/settings', [
        'settings' => ['company_name' => ['fa' => 'آرتاویل', 'en' => 'Artavil']],
    ])->assertRedirect();

    app(SettingsRepository::class)->flush();

    expect(Setting::query()->where('key', 'company_name')->value('value'))
        ->toBe(['fa' => 'آرتاویل', 'en' => 'Artavil']);
});

it('refuses an editor, who has no settings permission', function (): void {
    $this->actingAs(User::factory()->editor()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->put('/admin/settings', ['settings' => ['founded_year' => '1997']])
        ->assertForbidden();

    expect(Setting::query()->where('key', 'founded_year')->value('value'))->not->toBe('1997');
});

it('labels settings in Persian instead of printing raw keys', function (): void {
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->get('/admin/settings')
        ->assertOk()
        ->assertSee('سال تأسیس')
        // The key still belongs in name="settings[founded_year]"; what must be
        // gone is the key used as the visible label, which is what the element
        // text asserts.
        ->assertDontSee('>founded_year<', escape: false);
});

it('offers a picker rather than a number box for a media setting', function (): void {
    // seo_default_og_media_id holds a media id. As a plain text input it asked
    // the operator to know, and type, a row id from another table.
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->get('/admin/settings')
        ->assertOk()
        ->assertSee('name="settings[seo_default_og_media_id]"', escape: false)
        ->assertSee('<select', escape: false);
});
