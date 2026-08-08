<?php

declare(strict_types=1);

use App\Models\ContactRequest;
use App\Models\Product;
use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use Illuminate\Support\Facades\Route;

function validEnquiry(array $overrides = []): array
{
    return [
        'type' => ContactRequestType::Contact->value,
        'name' => 'رضا محمدی',
        'phone' => '09121234567',
        'message' => 'لطفاً لیست قیمت پنل های‌گلاس را ارسال کنید.',
        ...$overrides,
    ];
}

it('stores a valid enquiry', function (): void {
    $this->post('/contact', validEnquiry())
        ->assertRedirect()
        ->assertSessionHas('status');

    $enquiry = ContactRequest::query()->sole();

    expect($enquiry->name)->toBe('رضا محمدی')
        ->and($enquiry->type)->toBe(ContactRequestType::Contact)
        ->and($enquiry->status)->toBe(LeadStatus::New);
});

it('records request metadata rather than accepting it from input', function (): void {
    $this->post('/contact', validEnquiry([
        // A submitter must not be able to forge these.
        'ip_address' => '1.2.3.4',
        'status' => LeadStatus::Closed->value,
        'handled_by' => 99,
    ]));

    $enquiry = ContactRequest::query()->sole();

    expect($enquiry->ip_address)->not->toBe('1.2.3.4')
        ->and($enquiry->status)->toBe(LeadStatus::New)
        ->and($enquiry->handled_by)->toBeNull();
});

it('links an enquiry raised from a product page', function (): void {
    $product = Product::factory()->create();

    $this->post('/contact', validEnquiry([
        'type' => ContactRequestType::Quote->value,
        'product_id' => $product->id,
    ]));

    expect(ContactRequest::query()->sole()->product_id)->toBe($product->id);
});

describe('validation', function (): void {
    it('requires a name, phone and message', function (): void {
        $this->post('/contact', ['type' => ContactRequestType::Contact->value])
            ->assertSessionHasErrors(['name', 'phone', 'message']);

        expect(ContactRequest::count())->toBe(0);
    });

    it('rejects an unknown enquiry type', function (): void {
        $this->post('/contact', validEnquiry(['type' => 'nonsense']))
            ->assertSessionHasErrors('type');
    });

    it('rejects a malformed phone number', function (): void {
        $this->post('/contact', validEnquiry(['phone' => 'not-a-number']))
            ->assertSessionHasErrors('phone');
    });

    it('accepts Persian digits in a phone number', function (): void {
        // Iranian visitors routinely paste numbers with Persian digits.
        $this->post('/contact', validEnquiry(['phone' => '۰۹۱۲۱۲۳۴۵۶۷']))
            ->assertSessionHasNoErrors();

        expect(ContactRequest::query()->sole()->phone)->toBe('09121234567');
    });

    it('rejects a province that is not an Iranian province', function (): void {
        $this->post('/contact', validEnquiry(['province' => 'Atlantis']))
            ->assertSessionHasErrors('province');
    });

    it('accepts a real province', function (): void {
        $this->post('/contact', validEnquiry(['province' => 'اصفهان']))
            ->assertSessionHasNoErrors();
    });

    it('rejects a product that does not exist', function (): void {
        $this->post('/contact', validEnquiry(['product_id' => 999999]))
            ->assertSessionHasErrors('product_id');
    });

    it('rejects an over-long message', function (): void {
        $this->post('/contact', validEnquiry(['message' => str_repeat('a', 5000)]))
            ->assertSessionHasErrors('message');
    });
});

describe('spam handling', function (): void {
    it('rejects a submission that fills the honeypot', function (): void {
        // Only a bot fills a field that is hidden from sight and from
        // assistive technology.
        $this->post('/contact', validEnquiry(['website' => 'http://spam.example']))
            ->assertSessionHasErrors('website');

        expect(ContactRequest::count())->toBe(0);
    });

    it('accepts a submission that leaves the honeypot empty', function (): void {
        $this->post('/contact', validEnquiry(['website' => '']))
            ->assertSessionHasNoErrors();
    });
});

it('includes a CSRF token in the form', function (): void {
    // Laravel's CSRF middleware short-circuits whenever runningUnitTests() is
    // true, so a feature test cannot exercise the rejection path. What is
    // verifiable here is that the form carries the token the middleware needs;
    // enforcement itself is the framework's.
    $this->get('/contact')
        ->assertOk()
        ->assertSee('name="_token"', escape: false);
});

it('routes every enquiry form through the web middleware group', function (): void {
    // Membership of the group is what applies CSRF verification in production.
    $route = Route::getRoutes()->getByName('fa.contact.store');

    expect($route->gatherMiddleware())->toContain('web');
});

it('renders the form with the requested enquiry type preselected', function (): void {
    $this->get('/contact?type=representation')
        ->assertOk()
        ->assertSee('value="representation" selected', escape: false);
});

it('falls back to the general enquiry type for an unknown type', function (): void {
    $this->get('/contact?type=nonsense')
        ->assertOk()
        ->assertSee('value="contact" selected', escape: false);
});
