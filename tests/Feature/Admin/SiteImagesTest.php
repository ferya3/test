<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Media;
use App\Models\Page;
use App\Models\Setting;
use App\Models\User;
use App\Services\Admin\SiteImageRegistry;
use App\Services\SettingsRepository;
use Database\Seeders\PageSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, PageSeeder::class]);
});

function actingAsPanelUser(string $role): User
{
    $user = User::factory()->{$role}()->create();
    test()->actingAs($user);
    session([RequireTwoFactor::SESSION_KEY => time()]);

    return $user;
}

it('lists every fixed image slot on one screen', function (): void {
    actingAsPanelUser('admin');

    $this->get('/admin/site-images')
        ->assertOk()
        ->assertSee(__('admin.site_images.home_hero'))
        ->assertSee(__('admin.site_images.about_hero'))
        ->assertSee(__('admin.site_images.factory_hero'))
        ->assertSee(__('admin.site_images.process_hero'))
        ->assertSee(__('admin.site_images.quality_hero'));
});

it('links the screen from the sidebar', function (): void {
    actingAsPanelUser('admin');

    $this->get('/admin')
        ->assertOk()
        ->assertSee('href="'.url('/admin/site-images').'"', escape: false);
});

it('stores the home hero as a setting and shows it on the homepage', function (): void {
    actingAsPanelUser('admin');
    $media = Media::factory()->create();

    $this->put('/admin/site-images', ['images' => ['home_hero' => $media->id]])
        ->assertRedirect();

    expect(Setting::query()->where('key', 'home_hero_media_id')->value('value'))
        ->toBe($media->id);

    // The whole point of the slot: what is chosen here is what the visitor
    // sees. Asserted as "the hero is now a photograph" rather than by matching
    // a filename — x-media.picture renders generated derivatives, so the
    // original name need not appear at all.
    app(SettingsRepository::class)->flush();

    $this->get('/')
        ->assertOk()
        ->assertSee('<picture>', escape: false)
        ->assertDontSee('hero-grain');
});

it('falls back to the textured band while no home hero is chosen', function (): void {
    // A seeded install has no photography yet and should look deliberately
    // unphotographed rather than broken.
    $this->get('/')->assertOk()->assertSee('hero-grain');
});

it('stores a page hero on its own page row', function (): void {
    actingAsPanelUser('admin');
    $media = Media::factory()->create();

    $this->put('/admin/site-images', ['images' => ['factory_hero' => $media->id]])
        ->assertRedirect();

    expect(Page::query()->where('template', 'factory')->value('hero_media_id'))
        ->toBe($media->id);
});

it('clears a slot when nothing is chosen', function (): void {
    actingAsPanelUser('admin');
    $media = Media::factory()->create();

    $this->put('/admin/site-images', ['images' => ['home_hero' => $media->id]]);
    $this->put('/admin/site-images', ['images' => ['home_hero' => null]])->assertRedirect();

    expect(app(SiteImageRegistry::class)->current()['home_hero'])->toBeNull();
});

it('rejects a media id that does not exist', function (): void {
    actingAsPanelUser('admin');

    $this->put('/admin/site-images', ['images' => ['home_hero' => 999999]])
        ->assertSessionHasErrors('images.home_hero');
});

it('ignores a slot key that is not in the registry', function (): void {
    // The registry is the definition, so a forged field cannot create a slot.
    actingAsPanelUser('admin');
    $media = Media::factory()->create();

    $this->put('/admin/site-images', [
        'images' => ['home_hero' => $media->id, 'not_a_slot' => $media->id],
    ])->assertRedirect();

    expect(Setting::query()->where('key', 'not_a_slot')->exists())->toBeFalse();
});

it('offers an editor only the slots their role can write', function (): void {
    // An Editor may edit pages but not settings, so the page heroes appear and
    // the settings-backed homepage hero does not — rather than being offered
    // and then refused on save.
    actingAsPanelUser('editor');

    $this->get('/admin/site-images')
        ->assertOk()
        ->assertSee(__('admin.site_images.factory_hero'))
        ->assertDontSee(__('admin.site_images.home_hero'));
});

it('does not let an editor write the home hero even by posting it', function (): void {
    actingAsPanelUser('editor');
    $media = Media::factory()->create();

    $this->put('/admin/site-images', ['images' => ['home_hero' => $media->id]])
        ->assertForbidden();

    expect(Setting::query()->where('key', 'home_hero_media_id')->value('value'))->toBeNull();
});

it('warns when the chosen image is too narrow for the largest derivative', function (): void {
    /*
     * A derivative is only produced when it would be smaller than the source,
     * so a 1920px upload caps the srcset at 1920 and renders soft on a large
     * monitor. Correct — upscaling would ship a bigger, blurrier file — but
     * invisible, unless the panel says so at the point the image is chosen.
     */
    actingAsPanelUser('admin');

    $narrow = Media::factory()->create(['width' => 1920, 'height' => 1080]);
    $this->put('/admin/site-images', ['images' => ['home_hero' => $narrow->id]]);

    $this->get('/admin/site-images')
        ->assertOk()
        ->assertSee((string) max(config('media.widths')), escape: false);
});

it('says nothing when the image is large enough', function (): void {
    actingAsPanelUser('admin');

    $wide = Media::factory()->create(['width' => 2560, 'height' => 1440]);
    $this->put('/admin/site-images', ['images' => ['home_hero' => $wide->id]]);

    $this->get('/admin/site-images')
        ->assertOk()
        ->assertDontSee(__('admin.site_images.too_narrow', ['width' => 2560, 'largest' => 2560]));
});
