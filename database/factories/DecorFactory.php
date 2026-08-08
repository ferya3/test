<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Decor;
use App\Support\Enums\DecorFamily;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Decor>
 */
class DecorFactory extends Factory
{
    use MakesTranslations;

    protected $model = Decor::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en] = $this->decorNamePair();
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'name' => $this->bilingual("{$fa} {$index}", "{$en} {$index}"),
            'code' => 'D-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT),
            'description' => $this->bilingual($this->faParagraph(2), fake()->sentence()),
            'decor_family' => fake()->randomElement(DecorFamily::cases()),
            'media_id' => null,
            'position' => fake()->numberBetween(0, 60),
            'is_active' => true,
        ];
    }

    public function family(DecorFamily $family): static
    {
        return $this->state(fn (array $attributes): array => [
            'decor_family' => $family,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
