<?php

declare(strict_types=1);

use App\Models\Application;
use App\Models\Category;
use App\Models\Media;
use App\Models\Product;
use App\Models\Thickness;
use App\Services\Catalog\ProductService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    $this->service = app(ProductService::class);
    $this->category = Category::factory()->create();
});

function productAttributes(Category $category, array $overrides = []): array
{
    return [
        'code' => 'PNL-9001',
        'category_id' => $category->id,
        'name' => ['fa' => 'پنل آزمایشی', 'en' => 'Test Panel'],
        'is_active' => true,
        ...$overrides,
    ];
}

it('creates a product with its pivots in one transaction', function (): void {
    $thicknesses = Thickness::factory()->count(2)->create()->pluck('id')->all();
    $applications = Application::factory()->count(2)->create()->pluck('id')->all();

    $product = $this->service->create(productAttributes($this->category), [
        'thicknesses' => $thicknesses,
        'applications' => $applications,
    ]);

    expect($product->thicknesses)->toHaveCount(2)
        ->and($product->applications)->toHaveCount(2);
});

it('replaces sheet sizes wholesale rather than leaving orphans', function (): void {
    $product = $this->service->create(productAttributes($this->category), [
        'dimensions' => [
            ['width_mm' => 2800, 'height_mm' => 1220],
            ['width_mm' => 2440, 'height_mm' => 1220],
        ],
    ]);

    expect($product->dimensions)->toHaveCount(2);

    // The admin form submits the complete list; removing one must remove it.
    $this->service->update($product, [], [
        'dimensions' => [['width_mm' => 3050, 'height_mm' => 1220]],
    ]);

    expect($product->refresh()->dimensions->pluck('width_mm')->all())->toBe([3050]);
});

it('replaces specifications wholesale', function (): void {
    $product = $this->service->create(productAttributes($this->category), [
        'specifications' => [
            ['group' => 'physical', 'label' => ['fa' => 'چگالی', 'en' => 'Density'], 'value' => ['fa' => '۷۴۰', 'en' => '740'], 'unit' => 'kg/m³'],
        ],
    ]);

    expect($product->specifications)->toHaveCount(1);

    $this->service->update($product, [], ['specifications' => []]);

    expect($product->refresh()->specifications)->toHaveCount(0);
});

it('preserves the submitted gallery order', function (): void {
    $media = Media::factory()->count(3)->create();
    $ordered = [$media[2]->id, $media[0]->id, $media[1]->id];

    $product = $this->service->create(productAttributes($this->category), ['gallery' => $ordered]);

    expect($product->gallery->pluck('id')->all())->toBe($ordered);
});

it('refuses to relate a product to itself', function (): void {
    // Otherwise the page renders a card linking to the page it is already on.
    $other = Product::factory()->create();
    $product = $this->service->create(productAttributes($this->category));

    $this->service->update($product, [], ['related' => [$product->id, $other->id]]);

    expect($product->refresh()->relatedProducts->pluck('id')->all())->toBe([$other->id]);
});

it('leaves relations untouched when the key is absent', function (): void {
    $product = $this->service->create(productAttributes($this->category), [
        'thicknesses' => Thickness::factory()->count(2)->create()->pluck('id')->all(),
    ]);

    // An edit that only changes the name must not silently clear the pivots.
    $this->service->update($product, ['name' => ['fa' => 'نام جدید', 'en' => 'New Name']]);

    expect($product->refresh()->thicknesses)->toHaveCount(2);
});

it('rolls back the whole edit when part of it fails', function (): void {
    $product = $this->service->create(productAttributes($this->category), [
        'thicknesses' => Thickness::factory()->count(2)->create()->pluck('id')->all(),
    ]);

    $originalName = $product->getTranslations('name');

    // Two identical sheet sizes violate the unique(product_id, width, height)
    // constraint — a realistic way for a half-filled admin form to fail.
    expect(fn () => $this->service->update(
        $product,
        ['name' => ['fa' => 'نیمه‌کاره', 'en' => 'Half Applied']],
        ['dimensions' => [
            ['width_mm' => 2800, 'height_mm' => 1220],
            ['width_mm' => 2800, 'height_mm' => 1220],
        ]],
    ))->toThrow(QueryException::class);

    // A half-applied edit that renames the product but drops its sizes would be
    // worse than a failed one.
    expect($product->refresh()->getTranslations('name'))->toBe($originalName)
        ->and($product->thicknesses)->toHaveCount(2);
});

it('soft deletes so an accidental removal is recoverable', function (): void {
    $product = $this->service->create(productAttributes($this->category));

    $this->service->delete($product);

    expect($product->refresh()->trashed())->toBeTrue()
        ->and(Product::withTrashed()->count())->toBe(1);

    $this->service->restore($product);

    expect($product->refresh()->trashed())->toBeFalse();
});

it('ignores non-numeric ids in a relation payload', function (): void {
    $thickness = Thickness::factory()->create();

    $product = $this->service->create(productAttributes($this->category), [
        'thicknesses' => [$thickness->id, 'not-an-id', null, ''],
    ]);

    expect($product->thicknesses->pluck('id')->all())->toBe([$thickness->id]);
});

it('commits nothing when creation itself fails', function (): void {
    $before = DB::table('products')->count();

    expect(fn () => $this->service->create(productAttributes($this->category, ['category_id' => 999999])))
        ->toThrow(QueryException::class);

    expect(DB::table('products')->count())->toBe($before);
});
