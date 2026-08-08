<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Queries\ProductQuery;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class CompareController extends Controller
{
    /**
     * Comparison is driven by slugs in the query string, so a comparison is a
     * shareable URL. The tray in localStorage only builds the link; the
     * products themselves are always resolved server-side and re-checked for
     * publication.
     */
    public function __invoke(Request $request, ProductQuery $query, SeoManager $seo): View
    {
        $slugs = array_values(array_filter(
            explode(',', (string) $request->query('products', '')),
            static fn (string $slug): bool => $slug !== '',
        ));

        return view('pages.compare', [
            'products' => $query->bySlugs($slugs),
            // A shareable URL is still not one worth indexing: the content is
            // entirely a function of the ?products= query string.
            'seo' => $seo->forUnindexedPage(
                routeName: 'compare',
                title: __('compare.heading'),
                description: __('compare.lead'),
            ),
        ]);
    }
}
