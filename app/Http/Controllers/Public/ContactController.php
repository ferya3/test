<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\Public\StoreContactRequest;
use App\Models\ContactRequest;
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

    public function store(StoreContactRequest $request): RedirectResponse
    {
        // Request metadata is recorded here rather than accepted from input.
        $enquiry = new ContactRequest($request->safe()->except('website'));
        $enquiry->ip_address = $request->ip();
        $enquiry->user_agent = substr((string) $request->userAgent(), 0, 512);
        $enquiry->save();

        return redirect()
            ->to(lroute('contact').'#contact-form')
            ->with('status', __('contact.submitted'));
    }
}
