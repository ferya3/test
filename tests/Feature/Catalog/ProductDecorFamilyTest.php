<?php

declare(strict_types=1);

use App\Http\Middleware\RequireTwoFactor;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use App\Queries\ProductQuery;
use App\Support\Data\ProductFilters;
use App\Support\Enums\DecorFamily;
use Database\Seeders\CategorySeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingSeeder;

/**
 * A product's decor family, chosen on the product itself.
 *
 * It used to be reachable only through the product's decor record, so filing a
 * panel under "طرح چوب" meant first creating a named decor and knowing which
 * family it belonged to. Nothing on the product form offered the four
 * families, and the connection between the choice and the site's filter was
 * invisible.
 */
beforeEach(function (): void {
    $this->seed([RolePermissionSeeder::class, SettingSeeder::class, CategorySeeder::class]);
});

it('offers the four families on the product form', function (): void {
    $this->actingAs(User::factory()->admin()->create());
    session([RequireTwoFactor::SESSION_KEY => time()]);

    $response = $this->get('/admin/products/create')->assertOk();

    $response->assertSee('name="decor_family"', escape: false);

    foreach (DecorFamily::cases() as $family) {
        $response->assertSee('value="'.$family->value.'"', escape: false);
    }
});

it('files a product under the family chosen for it', function (): void {
    // The whole path, end to end: set the family on the product, then find the
    // product under that filter on the public page.
    $category = Category::query()->where('slug', 'hpl-cabinet-panel')->firstOrFail();

    $oak = Product::factory()->create([
        'category_id' => $category->id,
        'decor_family' => DecorFamily::Wood,
        'is_active' => true,
        'published_at' => now()->subDay(),
    ]);

    $marble = Product::factory()->create([
        'category_id' => $category->id,
        'decor_family' => DecorFamily::Stone,
        'is_active' => true,
        'published_at' => now()->subDay(),
    ]);

    $this->get('/categories/hpl-cabinet-panel?family=wood')
        ->assertOk()
        ->assertSee($oak->name)
        ->assertDontSee($marble->name);
});

it('counts the families against the products that carry them', function (): void {
    $category = Category::query()->where('slug', 'hpl-cabinet-panel')->firstOrFail();

    Product::factory()->count(3)->create([
        'category_id' => $category->id,
        'decor_family' => DecorFamily::Solid,
        'is_active' => true,
        'published_at' => now()->subDay(),
    ]);

    $facets = app(ProductQuery::class)
        ->facets(new ProductFilters(categories: ['hpl-cabinet-panel']));

    expect($facets['family']['solid'] ?? 0)->toBe(3);
});

it('does not need a decor record to be filterable', function (): void {
    // The point of the change: a panel is filed by how it looks, without a
    // named decor having to exist first.
    $category = Category::query()->where('slug', 'hpl-cabinet-panel')->firstOrFail();

    $product = Product::factory()->create([
        'category_id' => $category->id,
        'decor_id' => null,
        'decor_family' => DecorFamily::Finish,
        'is_active' => true,
        'published_at' => now()->subDay(),
    ]);

    $this->get('/categories/hpl-cabinet-panel?family=finish')
        ->assertOk()
        ->assertSee($product->name);
});
