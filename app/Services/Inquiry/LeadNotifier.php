<?php

declare(strict_types=1);

namespace App\Services\Inquiry;

use App\Notifications\LeadReceived;
use App\Services\SettingsRepository;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Notifies the sales inbox that a lead arrived.
 *
 * A failed notification must never lose the lead: it is already committed, so a
 * mail problem is logged rather than surfaced to a visitor who did nothing
 * wrong and would have no way to act on it.
 */
class LeadNotifier
{
    public function __construct(private readonly SettingsRepository $settings) {}

    public function notify(Model $lead): void
    {
        $recipient = $this->settings->get('lead_notification_email');

        if (! is_string($recipient) || $recipient === '') {
            return;
        }

        try {
            Notification::route('mail', $recipient)->notify(new LeadReceived($lead));
        } catch (Throwable $exception) {
            Log::error('Lead notification could not be queued.', [
                'lead_type' => $lead::class,
                'lead_id' => $lead->getKey(),
                'exception' => $exception->getMessage(),
            ]);
        }
    }
}
