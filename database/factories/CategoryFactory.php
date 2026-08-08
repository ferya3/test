<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Category;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    use MakesTranslations;

    protected $model = Category::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $index = fake()->unique()->numberBetween(1, 9999);

        return [
            'parent_id' => null,
            'name' => $this->bilingual(
                "{$this->faPanelNoun()} دسته {$index}",
                "Panel Group {$index}",
            ),
            'short_description' => $this->bilingual(
                'دسته‌بندی پنل‌های تولیدی کارخانه.',
                'Factory panel product group.',
            ),
            'description' => $this->bilingual($this->faParagraph(), fake()->paragraph()),
            'position' => fake()->numberBetween(0, 50),
            'is_active' => true,
            'is_featured' => false,
        ];
    }

    public function featured(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_featured' => true,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }

    public function childOf(Category $parent): static
    {
        return $this->state(fn (array $attributes): array => [
            'parent_id' => $parent->getKey(),
        ]);
    }
}
