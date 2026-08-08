<?php

declare(strict_types=1);

use App\Models\Application;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\Surface;
use App\Models\Thickness;
use App\Queries\ProductQuery;
use App\Services\Cache\CatalogCache;
use App\Support\Data\ProductFilters;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\ProductSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    $this->cache = app(CatalogCache::class);
});

it('embeds a version in every key', function (): void {
    $before = $this->cache->key('facets:abc');

    $this->cache->flush();

    // Invalidation is a version bump, so the old keys are simply orphaned and
    // expire on their own TTL — no scan-and-delete across the keyspace.
    expect($this->cache->key('facets:abc'))->not->toBe($before);
});

it('starts from a known version on a cold cache', function (): void {
    Cache::flush();

    // Without an explicit seed the first increment would start from zero and
    // silently reuse keys written under a previous version.
    expect($this->cache->version())->toBeGreaterThanOrEqual(1);
});

it('scopes keys by locale', function (): void {
    app()->setLocale('fa');
    $persian = $this->cache->key('facets:abc');

    app()->setLocale('en');

    // Facet labels are translated, so one locale must not serve another's.
    expect($this->cache->key('facets:abc'))->not->toBe($persian);
});

it('bumps the version when a catalogue model changes', function (): void {
    $before = $this->cache->version();

    Surface::factory()->create();

    expect($this->cache->version())->toBeGreaterThan($before);
});

it('bumps the version for every model a listing reads', function (): void {
    $models = [
        Product::class,
        Category::class,
        Color::class,
        Decor::class,
        Surface::class,
        Material::class,
        Application::class,
        Thickness::class,
    ];

    foreach ($models as $model) {
        $before = $this->cache->version();

        $model::factory()->create();

        expect($this->cache->version())
            ->toBeGreaterThan($before, "{$model} did not invalidate the catalogue cache");
    }
});

it('bumps the version when a product is deleted', function (): void {
    $product = Product::factory()->create();
    $before = $this->cache->version();

    $product->delete();

    expect($this->cache->version())->toBeGreaterThan($before);
});

describe('facet caching', function (): void {
    beforeEach(function (): void {
        $this->seed([AttributeSeeder::class, CategorySeeder::class, ProductSeeder::class]);
        $this->query = app(ProductQuery::class);
    });

    it('is disabled by default in tests', function (): void {
        // A stale facet count is far harder to debug than a slightly slower
        // suite, so phpunit.xml turns it off.
        expect($this->cache->enabled())->toBeFalse();
    });

    it('produces the same counts with caching on as with it off', function (): void {
        $filters = ProductFilters::fromRequest(Request::create('/products', 'GET', ['color' => 'pure-white']));

        $uncached = $this->query->facets($filters);

        config()->set('cache.catalog_enabled', true);

        expect($this->query->facets($filters))->toEqual($uncached);
    });

    it('runs no queries on a second identical request', function (): void {
        config()->set('cache.catalog_enabled', true);

        $filters = ProductFilters::fromRequest(Request::create('/products'));

        // Warm the entry, then count what a repeat costs.
        $this->query->facets($filters);

        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        $this->query->facets($filters);

        // Seven grouped aggregates become zero.
        expect($queries)->toBe(0);
    });

    it('serves fresh counts after a catalogue change invalidates the version', function (): void {
        config()->set('cache.catalog_enabled', true);

        $filters = ProductFilters::fromRequest(Request::create('/products'));
        $before = $this->query->facets($filters)['surface']['high-gloss'];

        Product::query()->published()->where('surface_id', Surface::where('slug', 'high-gloss')->value('id'))
            ->limit(2)->get()
            ->each(fn (Product $p) => $p->update(['is_active' => false]));

        // Saving a product bumps the version, so the previous entry is orphaned
        // rather than served.
        expect($this->query->facets($filters)['surface']['high-gloss'] ?? 0)->toBeLessThan($before);
    });
});
