<?php

declare(strict_types=1);

use App\Models\Color;
use App\Models\Product;
use App\Queries\ProductQuery;
use App\Services\Cache\CatalogCache;
use App\Support\Data\ProductFilters;
use Illuminate\Support\Facades\Cache;

/**
 * The catalogue caches are switched off in phpunit.xml, and the store there is
 * the array driver — which hands back the identical PHP value it was given.
 * Production runs phpredis, where every value is serialised.
 *
 * That gap let a cached Collection ship: it round-tripped perfectly under the
 * array driver and came back as __PHP_Incomplete_Class under phpredis with the
 * igbinary extension loaded, so the filter panel died with a TypeError on a
 * page that passed the whole suite. These tests deliberately turn the cache on
 * and use a *serialising* store, which is the only configuration that can see
 * that class of bug.
 */
beforeEach(function (): void {
    config()->set('cache.catalog_enabled', true);
    config()->set('cache.default', 'file');

    Cache::store('file')->flush();

    Product::factory()->count(3)->create();
});

afterEach(function (): void {
    Cache::store('file')->flush();
});

/**
 * Anything that is not an array or a scalar cannot be relied on to survive a
 * serialising cache driver intact.
 *
 * @return list<string> paths at which an object was found
 */
function objectPathsIn(mixed $value, string $path = '$'): array
{
    if (is_object($value)) {
        return [$path.' ('.get_debug_type($value).')'];
    }

    if (! is_array($value)) {
        return [];
    }

    $found = [];

    foreach ($value as $key => $item) {
        $found = [...$found, ...objectPathsIn($item, $path.'['.(is_int($key) ? $key : "'{$key}'").']')];
    }

    return $found;
}

it('caches filter groups as plain data, with no objects at any depth', function (): void {
    // The rule this encodes: a cached payload must contain arrays and scalars
    // only. An object here is the bug, whatever the local driver makes of it.
    $groups = app(ProductQuery::class)->filterGroups();

    expect(objectPathsIn($groups))->toBe([]);
});

it('caches facet counts as plain data too', function (): void {
    $facets = app(ProductQuery::class)->facets(new ProductFilters);

    expect(objectPathsIn($facets))->toBe([]);
});

it('returns filter groups unchanged when read back through a serialising store', function (): void {
    $query = app(ProductQuery::class);

    $fresh = $query->filterGroups();      // computes and writes
    $cached = $query->filterGroups();     // reads back through the file store

    expect($cached)->toEqual($fresh);
});

it('renders the products page from a warm cache', function (): void {
    // The end-to-end version: the first request populates every catalogue
    // cache, the second reads all of them back. A payload that does not
    // survive the round trip fails here with a 500.
    $this->get('/products')->assertOk();
    $this->get('/products')->assertOk();
});

it('renders the products page from a warm cache in both locales', function (): void {
    // Cache keys carry the locale, so each locale writes and reads its own.
    foreach (['/products', '/en/products', '/products', '/en/products'] as $url) {
        $this->get($url)->assertOk();
    }
});

it('rebuilds filter groups after the catalogue changes', function (): void {
    $query = app(ProductQuery::class);

    expect($query->filterGroups()['color']['options'])->toHaveCount(Color::count());

    // The observer bumps the cache version, which orphans the old key.
    Color::factory()->create();

    expect($query->filterGroups()['color']['options'])->toHaveCount(Color::count());
});

it('does not hand out a stale version after a flush within the same request', function (): void {
    // version() is memoised per request; without clearing that memo on flush,
    // the rest of the request would write new values under keys it just
    // orphaned.
    $cache = app(CatalogCache::class);

    $before = $cache->key('probe');
    $cache->flush();

    expect($cache->key('probe'))->not->toBe($before);
});
