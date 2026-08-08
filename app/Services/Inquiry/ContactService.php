<?php

declare(strict_types=1);

namespace App\Services\Inquiry;

use App\Models\ContactRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Records an enquiry and notifies the sales inbox.
 *
 * Request metadata is captured here rather than accepted from input, so a
 * submitter cannot forge the IP, the triage status, or who handled it.
 */
class ContactService
{
    public function __construct(private readonly LeadNotifier $notifier) {}

    /**
     * @param  array<string, mixed>  $attributes  already validated by the Form Request
     */
    public function record(array $attributes, Request $request): ContactRequest
    {
        $enquiry = DB::transaction(function () use ($attributes, $request): ContactRequest {
            $enquiry = new ContactRequest($attributes);

            $enquiry->ip_address = $request->ip();
            $enquiry->user_agent = substr((string) $request->userAgent(), 0, 512);

            $enquiry->save();

            return $enquiry;
        });

        $this->notifier->notify($enquiry);

        return $enquiry;
    }
}
