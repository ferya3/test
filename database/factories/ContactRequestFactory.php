<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\ContactRequest;
use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use App\Support\IranProvinces;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ContactRequest>
 */
class ContactRequestFactory extends Factory
{
    protected $model = ContactRequest::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => ContactRequestType::Contact,
            'name' => fake('fa_IR')->name(),
            'company' => fake('fa_IR')->company(),
            'phone' => '0912'.fake()->numerify('#######'),
            'email' => fake()->safeEmail(),
            'province' => IranProvinces::random(),
            'city' => fake('fa_IR')->city(),
            'subject' => 'استعلام قیمت پنل کابینت',
            'message' => 'لطفاً لیست قیمت و شرایط فروش را ارسال کنید.',
            'product_id' => null,
            'status' => LeadStatus::New,
            'ip_address' => fake()->ipv4(),
            'user_agent' => fake()->userAgent(),
        ];
    }

    public function ofType(ContactRequestType $type): static
    {
        return $this->state(fn (array $attributes): array => [
            'type' => $type,
        ]);
    }

    public function withStatus(LeadStatus $status): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => $status,
        ]);
    }
}
