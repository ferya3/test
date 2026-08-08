<?php

declare(strict_types=1);

namespace App\Services\Inquiry;

use App\Models\Catalog;
use App\Models\CatalogRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CatalogRequestService
{
    public function __construct(private readonly LeadNotifier $notifier) {}

    /**
     * Record the lead and grant this session access to the file.
     *
     * @param  array<string, mixed>  $attributes  already validated by the Form Request
     */
    public function record(Catalog $catalog, array $attributes, Request $request): CatalogRequest
    {
        $lead = DB::transaction(function () use ($catalog, $attributes, $request): CatalogRequest {
            $lead = new CatalogRequest($attributes);

            $lead->catalog_id = $catalog->getKey();
            $lead->ip_address = $request->ip();
            $lead->user_agent = substr((string) $request->userAgent(), 0, 512);

            $lead->save();

            return $lead;
        });

        // Session-scoped grant: the download URL alone is not a way around the
        // form, and the grant does not extend to other catalogues.
        $request->session()->push('catalog.granted', $catalog->getKey());

        $this->notifier->notify($lead);

        return $lead;
    }

    public function hasBeenGranted(Request $request, Catalog $catalog): bool
    {
        return in_array(
            $catalog->getKey(),
            (array) $request->session()->get('catalog.granted', []),
            strict: true,
        );
    }
}
