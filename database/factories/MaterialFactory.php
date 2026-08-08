<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Material;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Material>
 */
class MaterialFactory extends Factory
{
    use MakesTranslations;

    protected $model = Material::class;

    /**
     * @var list<array{0: string, 1: string}>
     */
    private const array SUBSTRATES = [
        ['ام‌دی‌اف', 'MDF'],
        ['اچ‌دی‌اف', 'HDF'],
        ['نئوپان', 'Particleboard'],
        ['تخته چندلایه', 'Plywood'],
        ['ام‌دی‌اف ضد رطوبت', 'Moisture-Resistant MDF'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en] = self::SUBSTRATES[array_rand(self::SUBSTRATES)];
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'name' => $this->bilingual("{$fa} {$index}", "{$en} {$index}"),
            'description' => $this->bilingual($this->faParagraph(2), fake()->sentence()),
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
