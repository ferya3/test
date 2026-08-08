<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Catalog;
use App\Models\CatalogRequest;
use App\Support\Enums\LeadStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CatalogRequest>
 */
class CatalogRequestFactory extends Factory
{
    protected $model = CatalogRequest::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'catalog_id' => Catalog::factory(),
            'name' => fake('fa_IR')->name(),
            'company' => fake('fa_IR')->company(),
            'phone' => '0912'.fake()->numerify('#######'),
            'email' => fake()->safeEmail(),
            'city' => fake('fa_IR')->city(),
            'message' => null,
            'status' => LeadStatus::New,
            'ip_address' => fake()->ipv4(),
            'user_agent' => fake()->userAgent(),
        ];
    }

    public function withStatus(LeadStatus $status): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => $status,
        ]);
    }
}
