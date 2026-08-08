<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Catalog;
use App\Models\Media;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Catalog>
 */
class CatalogFactory extends Factory
{
    use MakesTranslations;

    protected $model = Catalog::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $year = fake()->numberBetween(2023, 2026);
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'title' => $this->bilingual(
                "کاتالوگ محصولات {$year} شماره {$index}",
                "Product Catalogue {$year} No. {$index}",
            ),
            'description' => $this->bilingual(
                'کاتالوگ کامل پنل‌های کابینت و پنل‌های تزئینی.',
                'Complete cabinet and decorative panel catalogue.',
            ),
            'cover_media_id' => null,
            'file_media_id' => Media::factory()->pdf(),
            'version' => "{$year}.1",
            'published_at' => now()->subMonths(fake()->numberBetween(0, 24)),
            'requires_registration' => true,
            'is_active' => true,
            'position' => fake()->numberBetween(0, 20),
        ];
    }

    /**
     * Freely downloadable, no lead form.
     */
    public function open(): static
    {
        return $this->state(fn (array $attributes): array => [
            'requires_registration' => false,
        ]);
    }

    public function withoutFile(): static
    {
        return $this->state(fn (array $attributes): array => [
            'file_media_id' => null,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
