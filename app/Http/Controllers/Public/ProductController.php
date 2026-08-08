<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Queries\ProductQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
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
            'filterGroups' => $query->filterGroups(),
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
}
