<?php

declare(strict_types=1);

namespace App\Queries;

use App\Models\Application;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\Surface;
use App\Models\Thickness;
use App\Services\Cache\CatalogCache;
use App\Support\Data\ProductFilters;
use App\Support\Enums\DecorFamily;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The catalogue read model.
 *
 * Owns the filter translation *and* the eager-load set, so no controller can
 * introduce an N+1 by forgetting a relation — which is why Model::preventLazyLoading
 * is enabled outside production.
 */
class ProductQuery
{
    public function __construct(private readonly CatalogCache $cache) {}

    /**
     * Everything a product card renders. Kept in one place so the grid, the
     * search page and the comparison page cannot drift apart.
     *
     * @var list<string>
     */
    public const array CARD_RELATIONS = [
        'category:id,slug,name',
        'surface:id,slug,name',
        'decor:id,slug,name,code',
        'color:id,slug,name,hex',
        'mainImage',
    ];

    /**
     * Additionally required by the product detail page.
     *
     * @var list<string>
     */
    public const array DETAIL_RELATIONS = [
        'material:id,slug,name',
        'thicknesses',
        'applications',
        'dimensions',
        'specifications',
        'gallery',
        'datasheet',
        'seo.ogImage',
    ];

    public function paginate(ProductFilters $filters): LengthAwarePaginator
    {
        return $this->filtered($filters)
            ->with(self::CARD_RELATIONS)
            ->paginate($filters->perPage)
            ->withQueryString();
    }

    /**
     * @return Collection<int, Product>
     */
    public function featured(int $limit = 6): Collection
    {
        return Product::query()
            ->published()
            ->featured()
            ->with(self::CARD_RELATIONS)
            ->ordered()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Product>
     */
    public function latest(int $limit = 8): Collection
    {
        return Product::query()
            ->published()
            ->with(self::CARD_RELATIONS)
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }

    /**
     * @param  list<string>  $slugs
     * @return Collection<int, Product>
     */
    public function bySlugs(array $slugs, int $limit = 4): Collection
    {
        if ($slugs === []) {
            return new Collection;
        }

        return Product::query()
            ->published()
            ->whereIn('slug', array_slice($slugs, 0, $limit))
            ->with([...self::CARD_RELATIONS, 'material:id,slug,name', 'thicknesses', 'applications', 'dimensions', 'specifications'])
            ->get();
    }

    /**
     * Counts per facet value for the current result set.
     *
     * Each facet is counted with every *other* filter applied but not its own,
     * so ticking a second colour widens rather than empties the list — the
     * behaviour people expect from faceted search.
     *
     * @return array<string, array<string, int>>
     */
    public function facets(ProductFilters $filters): array
    {
        // Seven grouped aggregate queries per request, over data that changes
        // only when an editor touches the catalogue. Keyed by the exact filter
        // combination and by locale.
        return $this->cache->remember(
            "facets:{$filters->fingerprint()}",
            CatalogCache::FACET_TTL,
            fn (): array => $this->computeFacets($filters),
        );
    }

    /**
     * The options the filter panel offers, per attribute.
     *
     * Lives beside facets() because the two are halves of the same panel — the
     * options and the counts against them — and share an invalidation trigger:
     * every model read here carries the InvalidatesCatalogCache observer.
     *
     * Cached because it was seven queries on every products page view for data
     * an editor changes a few times a year. Keyed by locale through
     * CatalogCache::key(), since the labels are translated.
     *
     * **Plain arrays only — never objects.** A cached Collection survives the
     * array driver used in tests and comes back as __PHP_Incomplete_Class under
     * phpredis with the igbinary extension loaded, which is the production
     * configuration. Iterating that yields raw property strings instead of the
     * option arrays, and the filter panel dies with a TypeError on a page that
     * passed every local test. facets() has always returned plain scalars,
     * which is why it never met this; the same rule applies here.
     *
     * @return array<string, array{label: string, options: list<array{value: string, label: string, hex?: string|null}>}>
     */
    public function filterGroups(): array
    {
        return $this->cache->remember(
            'filter-groups',
            CatalogCache::NAVIGATION_TTL,
            fn (): array => $this->computeFilterGroups(),
        );
    }

    /**
     * @return array<string, array{label: string, options: list<array{value: string, label: string, hex?: string|null}>}>
     */
    private function computeFilterGroups(): array
    {
        return [
            'category' => [
                'label' => __('nav.categories'),
                'options' => Category::query()->active()->ordered()->get()
                    ->map(fn (Category $c): array => ['value' => $c->slug, 'label' => $c->name])->all(),
            ],
            'surface' => [
                'label' => __('product.surface'),
                'options' => Surface::query()->active()->ordered()->get()
                    ->map(fn (Surface $s): array => ['value' => $s->slug, 'label' => $s->name])->all(),
            ],
            'color' => [
                'label' => __('product.color'),
                'options' => Color::query()->active()->ordered()->get()
                    ->map(fn (Color $c): array => ['value' => $c->slug, 'label' => $c->name, 'hex' => $c->hex])->all(),
            ],
            /*
             * The catalogue's one filter. By family rather than by individual
             * decor: there are dozens of decors and four families, and "what
             * does it look like?" is answered by the family.
             */
            'family' => [
                'label' => __('product.decor_family'),
                'options' => array_map(
                    static fn (DecorFamily $family): array => [
                        'value' => $family->value,
                        'label' => $family->label(),
                    ],
                    DecorFamily::cases(),
                ),
            ],
            'material' => [
                'label' => __('product.material'),
                'options' => Material::query()->active()->ordered()->get()
                    ->map(fn (Material $m): array => ['value' => $m->slug, 'label' => $m->name])->all(),
            ],
            'thickness' => [
                'label' => __('product.thickness'),
                'options' => Thickness::query()->active()->ordered()->get()
                    ->map(fn (Thickness $t): array => ['value' => $t->trimmedValue(), 'label' => $t->displayLabel()])->all(),
            ],
            'application' => [
                'label' => __('product.application'),
                'options' => Application::query()->active()->ordered()->get()
                    ->map(fn (Application $a): array => ['value' => $a->slug, 'label' => $a->name])->all(),
            ],
        ];
    }

    /**
     * @return array<string, array<string, int>>
     */
    private function computeFacets(ProductFilters $filters): array
    {
        return [
            'category' => $this->facetCounts($filters, 'category', fn (Builder $q) => $q
                ->join('categories', 'categories.id', '=', 'products.category_id')
                ->groupBy('categories.slug')
                ->select('categories.slug', DB::raw('count(distinct products.id) as aggregate'))),

            'color' => $this->facetCounts($filters, 'color', fn (Builder $q) => $q
                ->join('colors', 'colors.id', '=', 'products.color_id')
                ->groupBy('colors.slug')
                ->select('colors.slug', DB::raw('count(distinct products.id) as aggregate'))),

            'family' => $this->facetCounts($filters, 'family', fn (Builder $q) => $q
                ->join('decors', 'decors.id', '=', 'products.decor_id')
                ->whereNotNull('decors.decor_family')
                ->groupBy('decors.decor_family')
                // Aliased to `slug` because facetCounts() plucks that column
                // for every facet; the alias is the contract, not the name of
                // the underlying column.
                ->select(DB::raw('decors.decor_family as slug'), DB::raw('count(distinct products.id) as aggregate'))),

            'surface' => $this->facetCounts($filters, 'surface', fn (Builder $q) => $q
                ->join('surfaces', 'surfaces.id', '=', 'products.surface_id')
                ->groupBy('surfaces.slug')
                ->select('surfaces.slug', DB::raw('count(distinct products.id) as aggregate'))),

            'material' => $this->facetCounts($filters, 'material', fn (Builder $q) => $q
                ->join('materials', 'materials.id', '=', 'products.material_id')
                ->groupBy('materials.slug')
                ->select('materials.slug', DB::raw('count(distinct products.id) as aggregate'))),

            'application' => $this->facetCounts($filters, 'application', fn (Builder $q) => $q
                ->join('application_product', 'application_product.product_id', '=', 'products.id')
                ->join('applications', 'applications.id', '=', 'application_product.application_id')
                ->groupBy('applications.slug')
                ->select('applications.slug', DB::raw('count(distinct products.id) as aggregate'))),

            // value_mm is a decimal, so the database returns "18.00" while the
            // URL carries "18". Keys are normalised to match the filter values.
            'thickness' => $this->facetCounts(
                $filters,
                'thickness',
                fn (Builder $q) => $q
                    ->join('product_thickness', 'product_thickness.product_id', '=', 'products.id')
                    ->join('thicknesses', 'thicknesses.id', '=', 'product_thickness.thickness_id')
                    ->groupBy('thicknesses.value_mm')
                    ->select('thicknesses.value_mm as slug', DB::raw('count(distinct products.id) as aggregate')),
                normaliseKey: static fn (string $key): string => rtrim(rtrim($key, '0'), '.') ?: '0',
            ),
        ];
    }

    /**
     * The base query with all filters applied.
     */
    public function filtered(ProductFilters $filters, ?string $except = null): Builder
    {
        $query = Product::query()->published();

        if ($except !== 'category') {
            $this->applyCategories($query, $filters->categories);
        }

        if ($except !== 'color') {
            $this->applyAttribute($query, 'color', $filters->colors);
        }

        if ($except !== 'decor') {
            $this->applyAttribute($query, 'decor', $filters->decors);
        }

        if ($except !== 'family' && $filters->decorFamilies !== []) {
            // One decor per product, so this is a join rather than an exists on
            // a pivot — see Product::decor().
            $query->whereHas(
                'decor',
                fn (Builder $decor) => $decor->whereIn('decor_family', $filters->decorFamilies),
            );
        }

        if ($except !== 'surface') {
            $this->applyAttribute($query, 'surface', $filters->surfaces);
        }

        if ($except !== 'material') {
            $this->applyAttribute($query, 'material', $filters->materials);
        }

        if ($except !== 'application') {
            $this->applyApplications($query, $filters->applications);
        }

        if ($except !== 'thickness') {
            $this->applyThicknesses($query, $filters->thicknesses);
        }

        $this->applySearch($query, $filters->search);
        $this->applySort($query, $filters->sort);

        return $query;
    }

    /**
     * @param  list<string>  $slugs
     */
    private function applyCategories(Builder $query, array $slugs): void
    {
        if ($slugs === []) {
            return;
        }

        // Selecting a parent category includes everything beneath it, so
        // "Cabinet Panels" does not return an empty list when every product
        // actually sits in one of its children.
        $ids = Category::query()
            ->whereIn('slug', $slugs)
            ->pluck('id');

        $withChildren = Category::query()
            ->whereIn('id', $ids)
            ->orWhereIn('parent_id', $ids)
            ->pluck('id');

        $query->whereIn('products.category_id', $withChildren);
    }

    /**
     * @param  list<string>  $slugs
     */
    private function applyAttribute(Builder $query, string $relation, array $slugs): void
    {
        if ($slugs === []) {
            return;
        }

        $query->whereHas($relation, fn (Builder $q) => $q->whereIn('slug', $slugs));
    }

    /**
     * @param  list<string>  $slugs
     */
    private function applyApplications(Builder $query, array $slugs): void
    {
        if ($slugs === []) {
            return;
        }

        $query->whereHas('applications', fn (Builder $q) => $q->whereIn('applications.slug', $slugs));
    }

    /**
     * Thicknesses are filtered by their numeric value, which is what appears in
     * the URL ("?thickness=18") rather than an opaque id.
     *
     * @param  list<string>  $values
     */
    private function applyThicknesses(Builder $query, array $values): void
    {
        $numeric = array_values(array_filter($values, static fn (string $v): bool => is_numeric($v)));

        if ($numeric === []) {
            return;
        }

        $query->whereHas('thicknesses', fn (Builder $q) => $q->whereIn('thicknesses.value_mm', $numeric));
    }

    private function applySearch(Builder $query, ?string $term): void
    {
        if ($term === null) {
            return;
        }

        // MySQL uses the FULLTEXT index on the denormalised search column;
        // SQLite (tests) has no such index and falls back to LIKE.
        if (DB::connection()->getDriverName() === 'mysql') {
            $query->whereFullText('products.search_index', $term);

            return;
        }

        $escaped = addcslashes($term, '%_\\');

        $query->where(function (Builder $q) use ($escaped): void {
            $q->where('products.search_index', 'like', "%{$escaped}%")
                ->orWhere('products.code', 'like', "%{$escaped}%");
        });
    }

    private function applySort(Builder $query, string $sort): void
    {
        match ($sort) {
            'oldest' => $query->orderBy('products.published_at')->orderBy('products.id'),
            'name' => $query->orderBy('products.position')->orderBy('products.code'),
            'code' => $query->orderBy('products.code'),
            default => $query->orderByDesc('products.published_at')->orderByDesc('products.id'),
        };
    }

    /**
     * @param  callable(Builder): Builder  $shape
     * @param  (callable(string): string)|null  $normaliseKey
     * @return array<string, int>
     */
    private function facetCounts(
        ProductFilters $filters,
        string $facet,
        callable $shape,
        ?callable $normaliseKey = null,
    ): array {
        $query = $this->filtered($filters, except: $facet);

        // Ordering is meaningless on an aggregate and breaks strict group-by.
        $query->reorder();

        $counts = $shape($query)->pluck('aggregate', 'slug');

        $result = [];

        foreach ($counts as $key => $count) {
            $key = (string) $key;
            $result[$normaliseKey === null ? $key : $normaliseKey($key)] = (int) $count;
        }

        return $result;
    }
}
