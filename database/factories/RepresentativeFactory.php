<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Representative;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Representative>
 */
class RepresentativeFactory extends Factory
{
    use MakesTranslations;

    protected $model = Representative::class;

    /**
     * province(fa), city(fa), city(en), lat, lng
     *
     * @var list<array{0: string, 1: string, 2: string, 3: float, 4: float}>
     */
    private const array LOCATIONS = [
        ['تهران', 'تهران', 'Tehran', 35.6892, 51.3890],
        ['اصفهان', 'اصفهان', 'Isfahan', 32.6539, 51.6660],
        ['خراسان رضوی', 'مشهد', 'Mashhad', 36.2605, 59.6168],
        ['فارس', 'شیراز', 'Shiraz', 29.5918, 52.5837],
        ['آذربایجان شرقی', 'تبریز', 'Tabriz', 38.0800, 46.2919],
        ['البرز', 'کرج', 'Karaj', 35.8400, 50.9391],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$province, $cityFa, $cityEn, $latitude, $longitude] = self::LOCATIONS[array_rand(self::LOCATIONS)];
        $index = fake()->unique()->numberBetween(1, 99999);

        return [
            'name' => $this->bilingual(
                "نمایندگی {$cityFa} {$index}",
                "{$cityEn} Representative {$index}",
            ),
            'company' => $this->bilingual('گروه بازرگانی نمونه', 'Sample Trading Group'),
            'province' => $province,
            'city' => $cityFa,
            'address' => $this->bilingual(
                fake('fa_IR')->address(),
                fake('en_US')->address(),
            ),
            'phone' => '021'.fake()->numerify('########'),
            'mobile' => '0912'.fake()->numerify('#######'),
            'email' => fake()->unique()->safeEmail(),
            'website' => null,
            // Jitter so seeded pins do not stack on one point.
            'latitude' => $latitude + fake()->randomFloat(4, -0.08, 0.08),
            'longitude' => $longitude + fake()->randomFloat(4, -0.08, 0.08),
            'is_active' => true,
            'is_featured' => false,
            'position' => fake()->numberBetween(0, 50),
        ];
    }

    public function inProvince(string $province, string $city): static
    {
        return $this->state(fn (array $attributes): array => [
            'province' => $province,
            'city' => $city,
        ]);
    }

    public function withoutCoordinates(): static
    {
        return $this->state(fn (array $attributes): array => [
            'latitude' => null,
            'longitude' => null,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
