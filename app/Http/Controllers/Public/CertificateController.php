<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;

class CertificateController extends Controller
{
    public function __invoke(SeoManager $seo, SchemaGenerator $schema): View
    {
        return view('pages.certificates', [
            'certificates' => Certificate::query()
                ->active()
                ->with(['image', 'document'])
                ->ordered()
                ->get(),
            'seo' => $seo->forPage(
                routeName: 'certificates',
                title: __('pages.certificates.heading'),
                description: __('pages.certificates.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }
}
