<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Queries\ProductQuery;
use App\Services\Seo\SeoManager;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request, ProductQuery $query, SeoManager $seo): View
    {
        $filters = ProductFilters::fromRequest($request);

        return view('pages.search', [
            'filters' => $filters,
            'products' => $filters->search === null
                ? null
                : $query->paginate($filters),
            // Every query produces a different result set on the same URL
            // shape, which is exactly what search results should not offer up
            // to be indexed.
            'seo' => $seo->forUnindexedPage(
                routeName: 'search',
                title: __('pages.search.heading'),
                description: __('pages.search.lead'),
            ),
        ]);
    }
}
