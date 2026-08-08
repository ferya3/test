<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Application;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Application>
 */
class ApplicationFactory extends Factory
{
    use MakesTranslations;

    protected $model = Application::class;

    /**
     * @var list<array{0: string, 1: string}>
     */
    private const array USES = [
        ['کابینت آشپزخانه', 'Kitchen Cabinet'],
        ['کمد دیواری', 'Wardrobe'],
        ['دیوارپوش', 'Wall Panel'],
        ['مبلمان اداری', 'Office Furniture'],
        ['فضای تجاری', 'Commercial Fit-Out'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en] = self::USES[array_rand(self::USES)];
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'name' => $this->bilingual("{$fa} {$index}", "{$en} {$index}"),
            'description' => $this->bilingual($this->faParagraph(2), fake()->sentence()),
            'icon' => null,
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
