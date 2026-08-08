<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Representative;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class RepresentativeController extends Controller
{
    public function __invoke(Request $request, SeoManager $seo, SchemaGenerator $schema): View
    {
        $province = $request->string('province')->toString() ?: null;

        $representatives = Representative::query()
            ->active()
            ->when($province !== null, fn ($query) => $query->inProvince($province))
            ->ordered()
            ->get();

        return view('pages.representatives', [
            'representatives' => $representatives->groupBy('province'),
            // Only provinces that actually have a representative are offered.
            'provinces' => Representative::query()
                ->active()
                ->distinct()
                ->orderBy('province')
                ->pluck('province')
                ->all(),
            'activeProvince' => $province,
            // Canonical stays on the unfiltered URL: the province filter is a
            // view of the same content, not a distinct page worth indexing twice.
            'seo' => $seo->forPage(
                routeName: 'representatives',
                title: __('pages.representatives.heading'),
                description: __('pages.representatives.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }
}
