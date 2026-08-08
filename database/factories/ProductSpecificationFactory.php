<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Product;
use App\Models\ProductSpecification;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProductSpecification>
 */
class ProductSpecificationFactory extends Factory
{
    use MakesTranslations;

    protected $model = ProductSpecification::class;

    /**
     * label(fa), label(en), value(fa), value(en), unit, group
     *
     * @var list<array{0: string, 1: string, 2: string, 3: string, 4: string|null, 5: string}>
     */
    private const array SPECS = [
        ['چگالی', 'Density', '۷۴۰', '740', 'kg/m³', 'physical'],
        ['مقاومت خمشی', 'Bending Strength', '۲۳', '23', 'N/mm²', 'physical'],
        ['جذب آب', 'Water Absorption', 'کمتر از ۸', 'Below 8', '%', 'physical'],
        ['رهایش فرمالدهید', 'Formaldehyde Emission', 'کلاس E1', 'Class E1', null, 'compliance'],
        ['مقاومت به خط و خش', 'Scratch Resistance', 'درجه ۴', 'Grade 4', null, 'surface'],
        ['براقیت سطح', 'Surface Gloss', '۹۰', '90', 'GU', 'surface'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$labelFa, $labelEn, $valueFa, $valueEn, $unit, $group] = self::SPECS[array_rand(self::SPECS)];

        return [
            'product_id' => Product::factory(),
            'group' => $group,
            'label' => $this->bilingual($labelFa, $labelEn),
            'value' => $this->bilingual($valueFa, $valueEn),
            'unit' => $unit,
            'position' => fake()->numberBetween(0, 20),
        ];
    }
}
