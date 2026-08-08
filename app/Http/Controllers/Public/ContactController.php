<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\Public\StoreContactRequest;
use App\Services\Inquiry\ContactService;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Support\Enums\ContactRequestType;
use App\Support\IranProvinces;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function create(Request $request, SeoManager $seo, SchemaGenerator $schema): View
    {
        $type = ContactRequestType::tryFrom((string) $request->query('type', ''))
            ?? ContactRequestType::Contact;

        return view('pages.contact', [
            'activeType' => $type,
            'types' => ContactRequestType::cases(),
            'provinces' => IranProvinces::all(),
            // Canonical ignores ?type=: the four enquiry types are the same
            // page with a different tab preselected, not distinct content.
            'seo' => $seo->forPage(
                routeName: 'contact',
                title: __('pages.contact.heading'),
                description: __('pages.contact.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    public function store(StoreContactRequest $request, ContactService $enquiries): RedirectResponse
    {
        // The honeypot field is validated but never persisted.
        $enquiries->record($request->safe()->except('website'), $request);

        return redirect()
            ->to(lroute('contact').'#contact-form')
            ->with('status', __('contact.submitted'));
    }
}
