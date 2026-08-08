<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\Surface;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    use MakesTranslations;

    protected $model = Product::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$decorFa, $decorEn] = $this->decorNamePair();
        $index = fake()->unique()->numberBetween(1000, 99999);

        return [
            'code' => 'PNL-'.$index,
            'category_id' => Category::factory(),
            'material_id' => Material::factory(),
            'surface_id' => Surface::factory(),
            'decor_id' => Decor::factory(),
            'color_id' => Color::factory(),
            'name' => $this->bilingual(
                "{$this->faPanelNoun()} {$decorFa} {$index}",
                "{$decorEn} Panel {$index}",
            ),
            'short_description' => $this->bilingual(
                'پنل تزئینی با سطح مقاوم، مناسب کابینت و کمد.',
                'Decorative panel with a durable surface for cabinetry and wardrobes.',
            ),
            'description' => $this->bilingual($this->faParagraph(4), fake()->paragraphs(2, true)),
            'main_media_id' => null,
            'datasheet_media_id' => null,
            'is_active' => true,
            'is_featured' => false,
            'position' => fake()->numberBetween(0, 200),
            'published_at' => now()->subDays(fake()->numberBetween(0, 400)),
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

    /**
     * Active but scheduled — must not appear on the public site yet.
     */
    public function scheduled(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => true,
            'published_at' => now()->addWeek(),
        ]);
    }

    public function inCategory(Category $category): static
    {
        return $this->state(fn (array $attributes): array => [
            'category_id' => $category->getKey(),
        ]);
    }
}
