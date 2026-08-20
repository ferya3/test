<?php

declare(strict_types=1);

use App\Models\Catalog;
use App\Models\ContactRequest;
use App\Models\Media;
use App\Models\Setting;
use App\Notifications\LeadReceived;
use App\Services\SettingsRepository;
use App\Support\Enums\ContactRequestType;
use Database\Seeders\CategorySeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed([SettingSeeder::class, CategorySeeder::class]);
    Notification::fake();
});

function enquiry(array $overrides = []): array
{
    return [
        'type' => ContactRequestType::Contact->value,
        'name' => 'رضا محمدی',
        'phone' => '09121234567',
        'message' => 'لطفاً لیست قیمت پنل های‌گلاس را ارسال کنید.',
        ...$overrides,
    ];
}

describe('notifications', function (): void {
    it('notifies the sales inbox when an enquiry arrives', function (): void {
        $this->post('/contact', enquiry());

        Notification::assertSentOnDemand(
            LeadReceived::class,
            fn (LeadReceived $notification, array $channels, object $notifiable): bool => $notifiable->routes['mail'] === 'sales@example.com',
        );
    });

    it('queues the notification rather than blocking the submitter', function (): void {
        // A slow SMTP server must not become a slow contact page.
        expect(new LeadReceived(new ContactRequest))
            ->toBeInstanceOf(ShouldQueue::class);
    });

    it('still records the enquiry when no recipient is configured', function (): void {
        Setting::query()->where('key', 'lead_notification_email')->update(['value' => null]);
        app(SettingsRepository::class)->flush();

        $this->post('/contact', enquiry())->assertRedirect();

        expect(ContactRequest::count())->toBe(1);
        Notification::assertNothingSent();
    });

    it('notifies on a catalogue download request', function (): void {
        Storage::fake('documents');
        $media = Media::factory()->pdf()->create(['disk' => 'documents']);
        Storage::disk('documents')->put($media->path, '%PDF-1.4');
        $catalog = Catalog::factory()->create(['file_media_id' => $media->id, 'requires_registration' => true]);

        $this->post("/catalog/{$catalog->slug}/request", ['name' => 'مریم', 'phone' => '09121234567']);

        Notification::assertSentOnDemand(LeadReceived::class);
    });
});

describe('rate limiting', function (): void {
    beforeEach(function (): void {
        RateLimiter::clear('forms');
    });

    it('throttles repeated enquiry submissions from one address', function (): void {
        // Five allowed, the sixth rejected — enough that a shared office NAT is
        // not locked out, tight enough that a script cannot flood the inbox.
        for ($i = 0; $i < 5; $i++) {
            $this->post('/contact', enquiry())->assertRedirect();
        }

        $this->post('/contact', enquiry())->assertStatus(429);

        expect(ContactRequest::count())->toBe(5);
    });

    it('applies the throttle to the English routes as well', function (): void {
        for ($i = 0; $i < 5; $i++) {
            $this->post('/en/contact', enquiry());
        }

        // The limiter is keyed by IP, not by route, so switching language is
        // not a way around it.
        $this->post('/contact', enquiry())->assertStatus(429);
    });

    it('leaves ordinary browsing unthrottled', function (): void {
        for ($i = 0; $i < 12; $i++) {
            $this->get('/categories/hpl-cabinet-panel')->assertOk();
        }
    });
});

it('records request metadata server-side', function (): void {
    $this->post('/contact', enquiry(['ip_address' => '9.9.9.9', 'status' => 'closed']));

    $lead = ContactRequest::query()->sole();

    expect($lead->ip_address)->not->toBe('9.9.9.9')
        ->and($lead->status->value)->toBe('new')
        ->and($lead->user_agent)->not->toBeNull();
});

it('never persists the honeypot field', function (): void {
    $this->post('/contact', enquiry());

    expect(ContactRequest::query()->sole()->getAttributes())->not->toHaveKey('website');
});
