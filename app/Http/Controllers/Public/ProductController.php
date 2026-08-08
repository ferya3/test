<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\Surface;
use App\Models\Thickness;
use App\Queries\ProductQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ProductController extends Controller
{
    public function index(Request $request, ProductQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        $filters = ProductFilters::fromRequest($request);

        return view('pages.products.index', [
            'products' => $query->paginate($filters),
            'filters' => $filters,
            'facets' => $query->facets($filters),
            'filterGroups' => $this->filterGroups(),
            'seo' => $seo->forPage(
                routeName: 'products.index',
                title: __('pages.products.heading'),
                description: __('pages.products.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    public function show(Product $product, ProductQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        // Route model binding resolves by slug without regard to publication,
        // so an unpublished product must not be reachable by guessing its URL.
        if (! $product->isPublished()) {
            throw new NotFoundHttpException;
        }

        $product->load([...ProductQuery::CARD_RELATIONS, ...ProductQuery::DETAIL_RELATIONS]);
        $product->loadMissing(['relatedProducts' => fn ($q) => $q->published()->with(ProductQuery::CARD_RELATIONS)]);

        $canonical = $seo->canonicalFor($product, 'products.show', ['product' => $product->slug]);

        return view('pages.products.show', [
            'product' => $product,
            'related' => $product->relatedProducts,
            'seo' => $seo->forModel(
                model: $product,
                routeName: 'products.show',
                routeParams: ['product' => $product->slug],
                fallbackTitle: $product->name,
                fallbackDescription: $product->short_description ?: Str::limit(strip_tags((string) $product->description), 160),
                fallbackImage: $product->mainImage,
                ogType: 'product',
                structuredData: $schema->graph([
                    $schema->organization(),
                    $schema->website(),
                    $schema->product($product, $canonical),
                ]),
            ),
        ]);
    }

    /**
     * The facet definitions the filter panel renders: each is a key, a label and
     * the available options. Loaded once here rather than in the view, so Blade
     * stays free of queries.
     *
     * @return array<string, array{label: string, options: Collection<int, array{value: string, label: string, hex?: string|null}>}>
     */
    private function filterGroups(): array
    {
        return [
            'category' => [
                'label' => __('nav.categories'),
                'options' => Category::query()->active()->ordered()->get()
                    ->map(fn (Category $c): array => ['value' => $c->slug, 'label' => $c->name]),
            ],
            'surface' => [
                'label' => __('product.surface'),
                'options' => Surface::query()->active()->ordered()->get()
                    ->map(fn (Surface $s): array => ['value' => $s->slug, 'label' => $s->name]),
            ],
            'color' => [
                'label' => __('product.color'),
                'options' => Color::query()->active()->ordered()->get()
                    ->map(fn (Color $c): array => ['value' => $c->slug, 'label' => $c->name, 'hex' => $c->hex]),
            ],
            'decor' => [
                'label' => __('product.decor'),
                'options' => Decor::query()->active()->ordered()->get()
                    ->map(fn (Decor $d): array => ['value' => $d->slug, 'label' => $d->name]),
            ],
            'material' => [
                'label' => __('product.material'),
                'options' => Material::query()->active()->ordered()->get()
                    ->map(fn (Material $m): array => ['value' => $m->slug, 'label' => $m->name]),
            ],
            'thickness' => [
                'label' => __('product.thickness'),
                'options' => Thickness::query()->active()->ordered()->get()
                    ->map(fn (Thickness $t): array => ['value' => $t->trimmedValue(), 'label' => $t->displayLabel()]),
            ],
            'application' => [
                'label' => __('product.application'),
                'options' => Application::query()->active()->ordered()->get()
                    ->map(fn (Application $a): array => ['value' => $a->slug, 'label' => $a->name]),
            ],
        ];
    }
}
