<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Company;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Company>
 */
class CompanyFactory extends Factory
{
    use MakesTranslations;

    protected $model = Company::class;

    /**
     * @var list<array{0: string, 1: string, 2: string, 3: string, 4: string}>
     */
    private const array SECTORS = [
        ['صنایع پنل', 'Panel Industries', 'پنل کابینت و دیوارپوش', 'Cabinet and wall panels', '#B4541A'],
        ['کاغذ دکوراتیو', 'Decor Paper', 'کاغذ دکور و فیلم ملامینه', 'Decor paper and melamine film', '#2F6F8F'],
        ['رزین شیمی', 'Resin Chemicals', 'رزین و چسب صنعتی', 'Industrial resins and adhesives', '#5B7B3A'],
        ['لبه‌چسبان', 'Edgebanding', 'نوار لبه پی‌وی‌سی و ای‌بی‌اس', 'PVC and ABS edge banding', '#7A4E9C'],
        ['یراق‌آلات', 'Hardware', 'یراق‌آلات کابینت', 'Cabinet hardware', '#8F2F3E'],
    ];

    /**
     * @var list<array{0: string, 1: string}>
     */
    private const array CITIES = [
        ['تهران', 'Tehran'],
        ['اصفهان', 'Isfahan'],
        ['قزوین', 'Qazvin'],
        ['تبریز', 'Tabriz'],
        ['شیراز', 'Shiraz'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$nameFa, $nameEn, $sectorFa, $sectorEn, $accent] = self::SECTORS[array_rand(self::SECTORS)];
        [$cityFa, $cityEn] = self::CITIES[array_rand(self::CITIES)];
        $index = fake()->unique()->numberBetween(1, 99999);

        return [
            'name' => $this->bilingual("{$nameFa} {$index}", "{$nameEn} {$index}"),
            'tagline' => $this->bilingual('کیفیت ثابت، تحویل به‌موقع', 'Consistent quality, on time'),
            'sector' => $this->bilingual($sectorFa, $sectorEn),
            'summary' => $this->bilingual(
                "تولیدکننده {$sectorFa} برای صنعت کابینت و دکوراسیون داخلی.",
                "Manufacturer of {$sectorEn} for the cabinet and interiors industry.",
            ),
            'body' => $this->bilingual($this->faParagraph(3), fake()->paragraph()),
            'location' => $this->bilingual($cityFa, $cityEn),
            'founded_year' => fake()->numberBetween(1975, 2020),
            'employees' => fake()->numberBetween(40, 900),
            'site_area_sqm' => fake()->numberBetween(5, 120) * 1000,
            'capacity' => null,
            'accent_hex' => $accent,
            'logo_media_id' => null,
            'cover_media_id' => null,
            'website_url' => null,
            'email' => null,
            'phone' => null,
            'is_active' => true,
            'position' => fake()->numberBetween(0, 30),
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
