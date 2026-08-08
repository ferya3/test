<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Product;
use App\Models\ProductDimension;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProductDimension>
 */
class ProductDimensionFactory extends Factory
{
    protected $model = ProductDimension::class;

    /**
     * Standard panel sheet sizes in millimetres.
     *
     * @var list<array{0: int, 1: int}>
     */
    private const array SHEET_SIZES = [
        [2440, 1220],
        [2800, 1220],
        [3050, 1220],
        [2750, 1830],
        [2440, 1830],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$width, $height] = self::SHEET_SIZES[array_rand(self::SHEET_SIZES)];

        return [
            'product_id' => Product::factory(),
            'width_mm' => $width,
            'height_mm' => $height,
            'label' => null,
            'position' => fake()->numberBetween(0, 10),
        ];
    }

    public function size(int $width, int $height): static
    {
        return $this->state(fn (array $attributes): array => [
            'width_mm' => $width,
            'height_mm' => $height,
        ]);
    }
}
