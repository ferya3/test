<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\Public\StoreContactRequest;
use App\Services\Inquiry\ContactService;
use App\Support\Enums\ContactRequestType;
use App\Support\IranProvinces;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function create(Request $request): View
    {
        $type = ContactRequestType::tryFrom((string) $request->query('type', ''))
            ?? ContactRequestType::Contact;

        return view('pages.contact', [
            'activeType' => $type,
            'types' => ContactRequestType::cases(),
            'provinces' => IranProvinces::all(),
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
