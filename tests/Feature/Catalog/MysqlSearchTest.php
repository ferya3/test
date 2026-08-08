<?php

declare(strict_types=1);

use App\Models\Product;
use App\Queries\ProductQuery;
use App\Support\Data\ProductFilters;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The search path that only production takes.
 *
 * ProductQuery::applySearch() branches on the database driver: MySQL uses the
 * FULLTEXT index on products.search_index, SQLite falls back to LIKE. The suite
 * runs on SQLite, so before these tests the MySQL branch — and the migration
 * that creates the index it depends on — had never been executed by anything.
 *
 * That is the same shape as the cached-Collection bug from stage 8: a branch
 * the tests cannot reach because the test environment is not the production
 * one. The fix there was to exercise a serialising cache store; the fix here is
 * to run the suite against MySQL in CI. These tests skip on any other driver,
 * so they stay honest locally rather than quietly passing without asserting.
 */
beforeEach(function (): void {
    if (DB::connection()->getDriverName() !== 'mysql') {
        $this->markTestSkipped('FULLTEXT search is MySQL-only; CI runs this job against MySQL 8.');
    }
});

function searchFor(string $term): Collection
{
    return app(ProductQuery::class)
        ->paginate(new ProductFilters(search: $term))
        ->getCollection();
}

it('creates the FULLTEXT index the search branch depends on', function (): void {
    // whereFullText() against a column with no FULLTEXT index is a runtime
    // error on MySQL, not a slow query — so the migration and the query are one
    // unit and are asserted together.
    $indexes = DB::select("SHOW INDEX FROM products WHERE Key_name = 'products_search_index_fulltext'");

    expect($indexes)->not->toBeEmpty()
        ->and($indexes[0]->Index_type)->toBe('FULLTEXT');
});

it('finds a product by a word in its name', function (): void {
    Product::factory()->create(['name' => ['fa' => 'پنل هایگلاس سفید', 'en' => 'Glossy White Panel']]);

    expect(searchFor('Glossy')->pluck('slug'))->toHaveCount(1);
});

it('finds a product by its code', function (): void {
    // The code is folded into search_index by ProductObserver. Under LIKE this
    // is also covered by an explicit orWhere on products.code; under FULLTEXT
    // it works only because the observer put the code in the indexed column.
    Product::factory()->create(['code' => 'PNL-77321']);

    expect(searchFor('PNL-77321')->pluck('code'))->toContain('PNL-77321');
});

it('does not return unpublished products', function (): void {
    Product::factory()->inactive()->create(['name' => ['en' => 'Secret Prototype Panel']]);

    expect(searchFor('Prototype'))->toBeEmpty();
});

it('returns nothing rather than erroring for a term that matches no token', function (): void {
    Product::factory()->create(['name' => ['en' => 'Walnut Panel']]);

    expect(searchFor('zzzznomatchzzzz'))->toBeEmpty();
});

it('survives the characters FULLTEXT boolean mode would treat as operators', function (): void {
    // A visitor pasting "+panel -white" or a lone "*" must get a result set or
    // an empty one, never a 500. whereFullText() uses natural language mode,
    // where these are literal — this pins that it stays that way.
    Product::factory()->create(['name' => ['en' => 'Oak Panel']]);

    foreach (['+panel -white', '*', '"unclosed', '~panel', '<>panel', 'panel@@'] as $term) {
        expect(fn () => searchFor($term))->not->toThrow(Throwable::class);
    }
});

it('serves the public search page on MySQL', function (): void {
    Product::factory()->create(['name' => ['en' => 'Birch Panel']]);

    $this->get('/search?q=Birch')->assertOk();
    $this->get('/search?q='.urlencode('+*"'))->assertOk();
});
