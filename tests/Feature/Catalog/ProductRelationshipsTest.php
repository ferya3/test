<?php

declare(strict_types=1);

use App\Models\Application;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductDimension;
use App\Models\ProductSpecification;
use App\Models\Thickness;
use Illuminate\Database\QueryException;

it('loads its single-valued attributes', function (): void {
    $product = Product::factory()->create();

    expect($product->category)->not->toBeNull()
        ->and($product->material)->not->toBeNull()
        ->and($product->surface)->not->toBeNull()
        ->and($product->decor)->not->toBeNull()
        ->and($product->color)->not->toBeNull();
});

it('attaches many thicknesses ordered by value', function (): void {
    $product = Product::factory()->create();

    $product->thicknesses()->attach([
        Thickness::factory()->ofValue(22)->create()->id,
        Thickness::factory()->ofValue(16)->create()->id,
        Thickness::factory()->ofValue(18)->create()->id,
    ]);

    expect($product->thicknesses->map->trimmedValue()->all())->toBe(['16', '18', '22']);
});

it('attaches many applications ordered by position', function (): void {
    $product = Product::factory()->create();

    $product->applications()->attach([
        Application::factory()->create(['position' => 5])->id,
        Application::factory()->create(['position' => 1])->id,
    ]);

    expect($product->applications->pluck('position')->all())->toBe([1, 5]);
});

it('keeps related products in the curated order', function (): void {
    $product = Product::factory()->create();
    $first = Product::factory()->create();
    $second = Product::factory()->create();

    $product->relatedProducts()->attach([
        $second->id => ['position' => 1],
        $first->id => ['position' => 0],
    ]);

    expect($product->relatedProducts->pluck('id')->all())->toBe([$first->id, $second->id]);
});

it('groups specifications by their spec sheet section', function (): void {
    $product = Product::factory()->create();

    ProductSpecification::factory()->for($product)->create(['group' => 'physical', 'position' => 0]);
    ProductSpecification::factory()->for($product)->create(['group' => 'physical', 'position' => 1]);
    ProductSpecification::factory()->for($product)->create(['group' => 'surface', 'position' => 2]);

    $grouped = $product->load('specifications')->groupedSpecifications();

    expect(array_keys($grouped))->toBe(['physical', 'surface'])
        ->and($grouped['physical'])->toHaveCount(2)
        ->and($grouped['surface'])->toHaveCount(1);
});

it('renders sheet dimensions with a unit', function (): void {
    app()->setLocale('en');

    $product = Product::factory()->create();
    ProductDimension::factory()->for($product)->size(2800, 1220)->create();

    expect($product->load('dimensions')->dimensionLabels())->toBe(['2800 × 1220 mm']);
});

it('cascades pivot rows when a product is force deleted', function (): void {
    $product = Product::factory()->create();
    $product->thicknesses()->attach(Thickness::factory()->create()->id);

    expect(DB::table('product_thickness')->count())->toBe(1);

    $product->forceDelete();

    expect(DB::table('product_thickness')->count())->toBe(0);
});

it('keeps pivot rows while a product is only soft deleted', function (): void {
    $product = Product::factory()->create();
    $product->thicknesses()->attach(Thickness::factory()->create()->id);

    $product->delete();

    expect($product->trashed())->toBeTrue()
        ->and(DB::table('product_thickness')->count())->toBe(1);
});

it('refuses to delete a category that still holds products', function (): void {
    $category = Category::factory()->create();
    Product::factory()->inCategory($category)->create();

    // The FK is restrictOnDelete: losing a category must not orphan its products.
    expect(fn () => $category->delete())
        ->toThrow(QueryException::class);
});

it('deletes child categories when the parent goes', function (): void {
    $parent = Category::factory()->create();
    Category::factory()->childOf($parent)->create();

    $parent->delete();

    expect(Category::count())->toBe(0);
});

describe('publication scopes', function (): void {
    it('excludes inactive products', function (): void {
        Product::factory()->create();
        Product::factory()->inactive()->create();

        expect(Product::published()->count())->toBe(1);
    });

    it('excludes products scheduled for the future', function (): void {
        Product::factory()->create();
        Product::factory()->scheduled()->create();

        expect(Product::published()->count())->toBe(1);
    });

    it('includes products with no publication date', function (): void {
        Product::factory()->create(['published_at' => null]);

        expect(Product::published()->count())->toBe(1);
    });
});
