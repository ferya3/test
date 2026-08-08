<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\CatalogRequest;
use App\Models\ContactRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Tells the sales inbox a lead arrived.
 *
 * Queued: a visitor submitting a form should not wait on an SMTP round trip,
 * and a slow mail server should not turn into a slow contact page.
 */
class LeadReceived extends Notification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [30, 120];

    public function __construct(public readonly Model $lead) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject($this->subject())
            ->greeting(__('notifications.lead.greeting'))
            ->line($this->summary());

        foreach ($this->details() as $label => $value) {
            $message->line("**{$label}:** {$value}");
        }

        // Deliberately no link into the admin panel: the notification goes to a
        // shared inbox, and a deep link there is a phishing template waiting to
        // be copied. Staff open the panel themselves.
        return $message->line(__('notifications.lead.footer'));
    }

    private function subject(): string
    {
        return match (true) {
            $this->lead instanceof ContactRequest => __('notifications.lead.subject_contact', [
                'type' => $this->lead->type->label(),
            ]),
            $this->lead instanceof CatalogRequest => __('notifications.lead.subject_catalog'),
            default => __('notifications.lead.subject_generic'),
        };
    }

    private function summary(): string
    {
        return __('notifications.lead.summary', [
            'name' => (string) $this->lead->name,
            'phone' => (string) $this->lead->phone,
        ]);
    }

    /**
     * @return array<string, string>
     */
    private function details(): array
    {
        $common = array_filter([
            (string) __('contact.field.name') => $this->lead->name,
            (string) __('contact.field.phone') => $this->lead->phone,
            (string) __('contact.field.email') => $this->lead->email,
            (string) __('contact.field.company') => $this->lead->company,
            (string) __('contact.field.city') => $this->lead->city,
        ]);

        if ($this->lead instanceof ContactRequest) {
            return array_filter([
                ...$common,
                (string) __('contact.field.type') => $this->lead->type->label(),
                (string) __('contact.field.province') => $this->lead->province,
                (string) __('contact.field.subject') => $this->lead->subject,
                (string) __('contact.field.message') => $this->lead->message,
            ]);
        }

        if ($this->lead instanceof CatalogRequest) {
            return array_filter([
                ...$common,
                (string) __('nav.catalog') => $this->lead->catalog?->title,
                (string) __('contact.field.message') => $this->lead->message,
            ]);
        }

        return $common;
    }
}
