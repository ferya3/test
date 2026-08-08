<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Surface;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Surface>
 */
class SurfaceFactory extends Factory
{
    use MakesTranslations;

    protected $model = Surface::class;

    /**
     * @var list<array{0: string, 1: string, 2: int}>
     */
    private const array FINISHES = [
        ['مات', 'Matte', 8],
        ['سوپرمات', 'Super Matte', 3],
        ['های‌گلاس', 'High Gloss', 92],
        ['نیمه‌مات', 'Semi Matte', 35],
        ['طرح‌دار', 'Embossed', 15],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en, $gloss] = self::FINISHES[array_rand(self::FINISHES)];
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'name' => $this->bilingual("{$fa} {$index}", "{$en} {$index}"),
            'description' => $this->bilingual($this->faParagraph(2), fake()->sentence()),
            'gloss_level' => $gloss,
            'position' => fake()->numberBetween(0, 20),
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
