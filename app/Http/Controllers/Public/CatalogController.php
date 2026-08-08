<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\Public\StoreCatalogRequest;
use App\Models\Catalog;
use App\Services\Inquiry\CatalogRequestService;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CatalogController extends Controller
{
    public function index(SeoManager $seo, SchemaGenerator $schema): View
    {
        return view('pages.catalog', [
            'catalogs' => Catalog::query()
                ->active()
                ->with(['cover', 'file'])
                ->ordered()
                ->get(),
            'seo' => $seo->forPage(
                routeName: 'catalog.index',
                title: __('pages.catalog.heading'),
                description: __('pages.catalog.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    /**
     * Records the lead, then releases the download for this session only.
     */
    public function request(
        StoreCatalogRequest $request,
        Catalog $catalog,
        CatalogRequestService $leads,
    ): RedirectResponse {
        $this->assertDownloadable($catalog);

        $leads->record($catalog, $request->safe()->except('website'), $request);

        return redirect()->to(lroute('catalog.download', ['catalog' => $catalog->slug]));
    }

    public function download(
        Request $request,
        Catalog $catalog,
        CatalogRequestService $leads,
    ): StreamedResponse {
        $this->assertDownloadable($catalog);

        if ($catalog->requires_registration && ! $leads->hasBeenGranted($request, $catalog)) {
            throw new NotFoundHttpException;
        }

        $catalog->increment('download_count');

        $media = $catalog->file;

        // Files live outside the webroot and are streamed, so the storage path
        // is never a public URL.
        return Storage::disk($media->disk)->download(
            $media->path,
            $media->filename,
        );
    }

    private function assertDownloadable(Catalog $catalog): void
    {
        if (! $catalog->is_active || ! $catalog->isDownloadable()) {
            throw new NotFoundHttpException;
        }
    }
}
