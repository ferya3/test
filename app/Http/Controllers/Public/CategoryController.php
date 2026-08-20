<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Queries\ProductQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CategoryController extends Controller
{
    public function index(SeoManager $seo, SchemaGenerator $schema): View
    {
        return view('pages.categories.index', [
            'categories' => Category::query()
                ->active()
                ->roots()
                ->with(['cover', 'children' => fn ($q) => $q->where('is_active', true)])
                ->withCount(['products' => fn ($q) => $q->published()])
                ->ordered()
                ->get(),
            'seo' => $seo->forPage(
                routeName: 'categories.index',
                title: __('pages.categories.heading'),
                description: __('pages.categories.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    public function show(Request $request, Category $category, ProductQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        if (! $category->is_active) {
            throw new NotFoundHttpException;
        }

        $category->load(['cover', 'parent', 'children' => fn ($q) => $q->where('is_active', true), 'seo.ogImage']);

        // The category itself is a fixed constraint here rather than a
        // removable facet, so it is merged into the filters from the URL.
        $filters = ProductFilters::fromRequest($request);
        $scoped = new ProductFilters(
            categories: [$category->slug],
            colors: $filters->colors,
            decors: $filters->decors,
            decorFamilies: $filters->decorFamilies,
            surfaces: $filters->surfaces,
            materials: $filters->materials,
            applications: $filters->applications,
            thicknesses: $filters->thicknesses,
            search: $filters->search,
            sort: $filters->sort,
            perPage: $filters->perPage,
        );

        /*
         * Facets are counted against the scoped filters, so a family with no
         * products *in this category* shows zero rather than the site-wide
         * total — the count has to describe the list it sits next to.
         *
         * Only the decor family is offered. The other dimensions still work if
         * someone puts them in the URL and the admin still records them; the
         * catalogue simply asks one question.
         */
        $groups = array_intersect_key($query->filterGroups(), ['family' => true]);

        return view('pages.categories.show', [
            'category' => $category,
            'products' => $query->paginate($scoped),
            'filters' => $filters,
            'facets' => $query->facets($scoped),
            'filterGroups' => $groups,
            'seo' => $seo->forModel(
                model: $category,
                routeName: 'categories.show',
                routeParams: ['category' => $category->slug],
                fallbackTitle: $category->name,
                fallbackDescription: $category->short_description ?: Str::limit(strip_tags((string) $category->description), 160),
                fallbackImage: $category->cover,
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }
}
