<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * The media library is reachable and advertised.
 *
 * The sidebar hides any link the signed-in role would be refused at, which is
 * the right behaviour and also means a permission-matrix mistake removes a
 * whole feature from the panel silently — the page does not 403, it simply
 * stops being mentioned anywhere.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class]);
});

it('offers the media library to every role that can manage media', function (string $role): void {
    $this->actingAs(User::factory()->{$role}()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->get('/admin')
        ->assertOk()
        ->assertSee('href="'.url('/admin/media').'"', escape: false);

    $this->get('/admin/media')->assertOk();
})->with(['superAdmin', 'admin', 'editor', 'productManager']);

it('labels the media link in Persian rather than printing a translation key', function (): void {
    /*
     * Asserted against the rendered page, not against __() called here.
     *
     * The panel is deliberately single-language: /admin carries no locale
     * prefix, SetLocale therefore resolves it to the default (fa), and there is
     * no lang/en/admin.php at all. Outside a request the test process is still
     * on the fallback locale, so __('admin.resources.media') returns the raw
     * key — comparing the sidebar against that passes while both sides are
     * equally broken, which is how an unlabelled panel would ship.
     */
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $this->get('/admin')
        ->assertOk()
        ->assertSee('رسانه‌ها')
        ->assertDontSee('admin.resources.');
});
