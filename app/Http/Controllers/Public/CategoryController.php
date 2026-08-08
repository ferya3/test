<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Queries\ProductQuery;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CategoryController extends Controller
{
    public function index(): View
    {
        return view('pages.categories.index', [
            'categories' => Category::query()
                ->active()
                ->roots()
                ->with(['cover', 'children' => fn ($q) => $q->where('is_active', true)])
                ->withCount(['products' => fn ($q) => $q->published()])
                ->ordered()
                ->get(),
        ]);
    }

    public function show(Request $request, Category $category, ProductQuery $query): View
    {
        if (! $category->is_active) {
            throw new NotFoundHttpException;
        }

        $category->load(['cover', 'parent', 'children' => fn ($q) => $q->where('is_active', true)]);

        // The category itself is a fixed constraint here rather than a
        // removable facet, so it is merged into the filters from the URL.
        $filters = ProductFilters::fromRequest($request);
        $scoped = new ProductFilters(
            categories: [$category->slug],
            colors: $filters->colors,
            decors: $filters->decors,
            surfaces: $filters->surfaces,
            materials: $filters->materials,
            applications: $filters->applications,
            thicknesses: $filters->thicknesses,
            search: $filters->search,
            sort: $filters->sort,
            perPage: $filters->perPage,
        );

        return view('pages.categories.show', [
            'category' => $category,
            'products' => $query->paginate($scoped),
            'filters' => $filters,
        ]);
    }
}
