<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Thickness;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Thickness>
 */
class ThicknessFactory extends Factory
{
    protected $model = Thickness::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Unique because value_mm carries a unique constraint.
            'value_mm' => fake()->unique()->randomFloat(2, 2.5, 40),
            'label' => null,
            'position' => fake()->numberBetween(0, 20),
            'is_active' => true,
        ];
    }

    public function ofValue(float $millimetres): static
    {
        return $this->state(fn (array $attributes): array => [
            'value_mm' => $millimetres,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
