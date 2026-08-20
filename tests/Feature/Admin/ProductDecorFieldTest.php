<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Category;
use App\Models\Decor;
use App\Models\Product;
use App\Models\User;
use App\Support\Enums\DecorFamily;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * Picking a decor on a product is what decides which filter the product shows
 * up under, because the catalogue filters by decor *family* and a product does
 * not carry one — it carries a decor, which has one.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class]);
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);
});

it('offers a decor field on the product form', function (): void {
    $this->get('/admin/products/create')
        ->assertOk()
        ->assertSee('name="decor_id"', escape: false)
        ->assertSee(__('admin.field.decor'));
});

it('names the family beside each decor', function (): void {
    // Without this the operator picks "بلوط طبیعی" with no way to tell that it
    // files the product under طرح چوب on the public site.
    $decor = Decor::query()->where('decor_family', DecorFamily::Wood)->firstOrFail();

    $this->get('/admin/products/create')
        ->assertOk()
        ->assertSee($decor->name.' — '.DecorFamily::Wood->label());
});

it('lists a decor for every family, so no filter is unreachable', function (): void {
    // A family with no decors is a filter option that can never match anything.
    $families = Decor::query()->distinct()->pluck('decor_family')
        ->map(fn ($family) => $family instanceof DecorFamily ? $family->value : $family)
        ->all();

    foreach (DecorFamily::cases() as $family) {
        expect($families)->toContain($family->value);
    }
});

it('saves the chosen decor onto the product', function (): void {
    $decor = Decor::query()->firstOrFail();
    $category = Category::query()->firstOrFail();

    $this->post('/admin/products', [
        'code' => 'TEST-1',
        'name' => ['fa' => 'محصول آزمایشی', 'en' => 'Test product'],
        'category_id' => $category->id,
        'decor_id' => $decor->id,
        'is_active' => '1',
    ])->assertRedirect();

    expect(Product::query()->where('code', 'TEST-1')->value('decor_id'))
        ->toBe($decor->id);
});
