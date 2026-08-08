<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\Public\StoreCatalogRequest;
use App\Models\Catalog;
use App\Models\CatalogRequest;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CatalogController extends Controller
{
    public function index(): View
    {
        return view('pages.catalog', [
            'catalogs' => Catalog::query()
                ->active()
                ->with(['cover', 'file'])
                ->ordered()
                ->get(),
        ]);
    }

    /**
     * Records the lead, then releases the download for this session only.
     */
    public function request(StoreCatalogRequest $request, Catalog $catalog): RedirectResponse
    {
        $this->assertDownloadable($catalog);

        $lead = new CatalogRequest($request->safe()->except('website'));
        $lead->catalog_id = $catalog->getKey();
        $lead->ip_address = $request->ip();
        $lead->user_agent = substr((string) $request->userAgent(), 0, 512);
        $lead->save();

        // Session-scoped grant: the download URL is not guessable into a
        // bypass of the lead form.
        $request->session()->push('catalog.granted', $catalog->getKey());

        return redirect()
            ->to(lroute('catalog.download', ['catalog' => $catalog->slug]));
    }

    public function download(Request $request, Catalog $catalog): StreamedResponse
    {
        $this->assertDownloadable($catalog);

        if ($catalog->requires_registration && ! $this->hasBeenGranted($request, $catalog)) {
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

    private function hasBeenGranted(Request $request, Catalog $catalog): bool
    {
        return in_array(
            $catalog->getKey(),
            (array) $request->session()->get('catalog.granted', []),
            strict: true,
        );
    }
}
