<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Queries\ProductQuery;
use App\Support\Data\ProductFilters;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __invoke(Request $request, ProductQuery $query): View
    {
        $filters = ProductFilters::fromRequest($request);

        return view('pages.search', [
            'filters' => $filters,
            'products' => $filters->search === null
                ? null
                : $query->paginate($filters),
        ]);
    }
}
