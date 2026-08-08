<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Color;
use App\Support\Enums\ColorFamily;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Color>
 */
class ColorFactory extends Factory
{
    use MakesTranslations;

    protected $model = Color::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en] = $this->decorNamePair();
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'name' => $this->bilingual("{$fa} {$index}", "{$en} {$index}"),
            'hex' => fake()->hexColor(),
            'color_family' => fake()->randomElement(ColorFamily::cases()),
            'media_id' => null,
            'position' => fake()->numberBetween(0, 60),
            'is_active' => true,
        ];
    }

    public function family(ColorFamily $family): static
    {
        return $this->state(fn (array $attributes): array => [
            'color_family' => $family,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
