<?php

declare(strict_types=1);

use App\Models\Category;
use App\Models\Product;
use App\Models\Surface;
use App\Queries\ProductQuery;
use App\Support\Data\ProductFilters;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\ProductSeeder;
use Illuminate\Http\Request;

beforeEach(function (): void {
    $this->query = app(ProductQuery::class);
});

function filters(array $query = []): ProductFilters
{
    return ProductFilters::fromRequest(Request::create('/products', 'GET', $query));
}

describe('filter parsing', function (): void {
    it('accepts repeated parameters', function (): void {
        expect(filters(['color' => ['white', 'black']])->colors)->toBe(['white', 'black']);
    });

    it('accepts a comma separated list, which shared URLs often use', function (): void {
        expect(filters(['color' => 'white,black'])->colors)->toBe(['white', 'black']);
    });

    it('discards empty and duplicate values', function (): void {
        expect(filters(['color' => 'white,,white,black'])->colors)->toBe(['white', 'black']);
    });

    it('caps the list so a crafted URL cannot build an unbounded IN clause', function (): void {
        $many = implode(',', array_map(static fn (int $i): string => "c{$i}", range(1, 200)));

        expect(filters(['color' => $many])->colors)->toHaveCount(25);
    });

    it('rejects an unknown sort value', function (): void {
        expect(filters(['sort' => 'sneaky'])->sort)->toBe('latest');
    });

    it('clamps the page size', function (): void {
        expect(filters(['per_page' => 5000])->perPage)->toBe(ProductFilters::MAX_PER_PAGE)
            ->and(filters(['per_page' => 1])->perPage)->toBe(6);
    });

    it('trims an over-long search term', function (): void {
        expect(mb_strlen((string) filters(['q' => str_repeat('a', 500)])->search))->toBe(80);
    });

    it('treats a blank search as no search', function (): void {
        expect(filters(['q' => '   '])->search)->toBeNull();
    });
});

describe('filter state', function (): void {
    it('toggles a value on and off', function (): void {
        $base = filters();

        expect($base->toggle('color', 'white')->colors)->toBe(['white'])
            ->and($base->toggle('color', 'white')->toggle('color', 'white')->colors)->toBe([]);
    });

    it('keeps sorting when filters are cleared', function (): void {
        $cleared = filters(['color' => 'white', 'sort' => 'code'])->cleared();

        expect($cleared->colors)->toBe([])
            ->and($cleared->sort)->toBe('code');
    });

    it('counts active filters', function (): void {
        expect(filters(['color' => 'a,b', 'surface' => 'c', 'q' => 'oak'])->activeCount())->toBe(4);
    });

    it('omits defaults from the query string so URLs stay clean', function (): void {
        expect(filters(['sort' => 'latest'])->toQuery())->toBe([]);
    });

    it('joins lists with commas rather than emitting array syntax', function (): void {
        // http_build_query would otherwise produce "surface%5B0%5D=high-gloss",
        // which is neither readable nor comfortably shareable.
        $query = http_build_query(filters(['surface' => 'high-gloss,matte'])->toQuery());

        expect($query)->toBe('surface=high-gloss%2Cmatte')
            ->and(urldecode($query))->toBe('surface=high-gloss,matte');
    });

    it('round-trips through the query string unchanged', function (): void {
        $original = filters(['surface' => 'high-gloss,matte', 'color' => 'pure-white', 'q' => 'oak', 'sort' => 'code']);

        $roundTripped = ProductFilters::fromRequest(
            Request::create('/products', 'GET', $original->toQuery()),
        );

        expect($roundTripped->toArray())->toBe($original->toArray());
    });
});

describe('querying', function (): void {
    beforeEach(function (): void {
        $this->seed([
            AttributeSeeder::class,
            CategorySeeder::class,
            ProductSeeder::class,
        ]);
    });

    it('returns everything published when no filter is applied', function (): void {
        expect($this->query->paginate(filters())->total())
            ->toBe(Product::query()->published()->count());
    });

    it('filters by surface', function (): void {
        $surface = Surface::query()->where('slug', 'high-gloss')->firstOrFail();
        $expected = Product::query()->published()->where('surface_id', $surface->id)->count();

        expect($this->query->paginate(filters(['surface' => 'high-gloss']))->total())
            ->toBe($expected)
            ->toBeGreaterThan(0);
    });

    it('widens rather than narrows when a second value in the same facet is added', function (): void {
        $one = $this->query->paginate(filters(['surface' => 'high-gloss']))->total();
        $two = $this->query->paginate(filters(['surface' => 'high-gloss,super-matte']))->total();

        expect($two)->toBeGreaterThan($one);
    });

    it('narrows when filters from different facets are combined', function (): void {
        $surfaceOnly = $this->query->paginate(filters(['surface' => 'high-gloss']))->total();
        $combined = $this->query->paginate(filters([
            'surface' => 'high-gloss',
            'color' => 'pure-white',
        ]))->total();

        expect($combined)->toBeLessThan($surfaceOnly)->toBeGreaterThan(0);
    });

    it('includes descendants when a parent category is selected', function (): void {
        // The seeded catalogue is two flat groups, so the sub-group is built
        // here rather than assumed: an editor can add one from the admin at any
        // time, and selecting the parent must not then return an empty list.
        $parent = Category::query()->where('slug', 'hpl-cabinet-panel')->firstOrFail();

        $child = Category::factory()->create([
            'parent_id' => $parent->getKey(),
            'slug' => 'gloss-doors',
            'is_active' => true,
        ]);

        $moved = Product::query()->where('category_id', $parent->getKey())->firstOrFail();
        $moved->forceFill(['category_id' => $child->getKey()])->save();

        $directly = $parent->products()->count();

        expect($this->query->paginate(filters(['category' => 'gloss-doors']))->total())->toBe(1)
            ->and($this->query->paginate(filters(['category' => 'hpl-cabinet-panel']))->total())
            ->toBe($directly + 1);
    });

    it('filters by thickness using the value in the URL, not an id', function (): void {
        $total = $this->query->paginate(filters(['thickness' => '18']))->total();

        expect($total)->toBeGreaterThan(0)
            ->and($this->query->paginate(filters(['thickness' => '2.5']))->total())->toBe(0);
    });

    it('filters by application', function (): void {
        expect($this->query->paginate(filters(['application' => 'wall-panel']))->total())
            ->toBeGreaterThan(0);
    });

    it('excludes unpublished products from every filter', function (): void {
        $before = $this->query->paginate(filters())->total();

        Product::factory()->inactive()->create();
        Product::factory()->scheduled()->create();

        expect($this->query->paginate(filters())->total())->toBe($before);
    });

    it('finds products by search term', function (): void {
        $product = Product::query()->published()->firstOrFail();

        expect($this->query->paginate(filters(['q' => $product->code]))->total())
            ->toBeGreaterThan(0);
    });

    it('maintains the search index when a product is saved', function (): void {
        $product = Product::factory()->create(['name' => ['fa' => 'پنل آزمایشی', 'en' => 'Test Panel']]);

        expect($product->fresh()->search_index)
            ->toContain('Test Panel')
            ->toContain('پنل آزمایشی')
            ->toContain($product->code);
    });

    it('sorts by product code', function (): void {
        $codes = $this->query->paginate(filters(['sort' => 'code']))
            ->pluck('code')
            ->all();

        $sorted = $codes;
        sort($sorted);

        expect($codes)->toBe($sorted);
    });
});

describe('facet counts', function (): void {
    beforeEach(function (): void {
        $this->seed([
            AttributeSeeder::class,
            CategorySeeder::class,
            ProductSeeder::class,
        ]);
    });

    it('counts every facet', function (): void {
        $facets = $this->query->facets(filters());

        expect($facets)->toHaveKeys([
            'category', 'color', 'decor', 'surface', 'material', 'application', 'thickness',
        ]);
    });

    it('keys thickness counts by the value used in URLs', function (): void {
        // The column is a decimal, so the database returns "18.00" while the
        // filter carries "18".
        $counts = $this->query->facets(filters())['thickness'];

        expect($counts)->toHaveKey('18')
            ->and($counts)->not->toHaveKey('18.00');
    });

    it('leaves a facet unconstrained by its own selection', function (): void {
        // Ticking one surface must still show the counts for the others,
        // otherwise the panel becomes a dead end after the first click.
        $unfiltered = $this->query->facets(filters())['surface'];
        $filtered = $this->query->facets(filters(['surface' => 'high-gloss']))['surface'];

        expect($filtered)->toEqual($unfiltered);
    });

    it('constrains a facet by other facets', function (): void {
        $unfiltered = $this->query->facets(filters())['surface'];
        $filtered = $this->query->facets(filters(['color' => 'pure-white']))['surface'];

        expect(array_sum($filtered))->toBeLessThan(array_sum($unfiltered));
    });

    it('agrees with the number of results actually returned', function (): void {
        $facets = $this->query->facets(filters());

        foreach (['high-gloss', 'super-matte', 'matte'] as $surface) {
            expect($this->query->paginate(filters(['surface' => $surface]))->total())
                ->toBe($facets['surface'][$surface] ?? 0);
        }
    });

    it('counts every product once even when it matches several pivot rows', function (): void {
        // A product with three applications must not be counted three times.
        $facets = $this->query->facets(filters());

        expect(array_sum($facets['category']))->toBe(Product::query()->published()->count());
    });
});

describe('the filter panel', function (): void {
    beforeEach(function (): void {
        $this->seed([
            AttributeSeeder::class,
            CategorySeeder::class,
            ProductSeeder::class,
        ]);
    });

    it('works without JavaScript by linking each option', function (): void {
        $response = $this->get('/products');

        // Options are anchors carrying the toggled query string, not checkboxes
        // that need a script to submit.
        $response->assertOk()->assertSee('/products?surface=high-gloss', escape: false);
    });

    it('reflects the active filter in the page', function (): void {
        $this->get('/products?surface=high-gloss')
            ->assertOk()
            ->assertSee('aria-current="true"', escape: false);
    });

    it('offers a way to clear filters once any are applied', function (): void {
        $this->get('/products?surface=high-gloss')
            ->assertOk()
            ->assertSee(__('ui.clear_filters'));
    });
});
