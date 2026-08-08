<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Project;
use App\Support\Enums\ProjectType;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory
{
    use MakesTranslations;

    protected $model = Project::class;

    /**
     * @var list<array{0: string, 1: string}>
     */
    private const array CITIES = [
        ['تهران', 'Tehran'],
        ['اصفهان', 'Isfahan'],
        ['مشهد', 'Mashhad'],
        ['شیراز', 'Shiraz'],
        ['تبریز', 'Tabriz'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$cityFa, $cityEn] = self::CITIES[array_rand(self::CITIES)];
        $index = fake()->unique()->numberBetween(1, 99999);
        $year = fake()->numberBetween(2018, 2026);

        return [
            'title' => $this->bilingual(
                "پروژه مجتمع {$cityFa} {$index}",
                "{$cityEn} Complex Project {$index}",
            ),
            'client' => $this->bilingual('گروه ساختمانی نمونه', 'Sample Construction Group'),
            'location' => $this->bilingual($cityFa, $cityEn),
            'summary' => $this->bilingual(
                'تأمین پنل کابینت و دیوارپوش برای واحدهای مسکونی.',
                'Cabinet panel and wall panel supply for residential units.',
            ),
            'body' => $this->bilingual($this->faParagraph(5), fake()->paragraphs(3, true)),
            'cover_media_id' => null,
            'year' => $year,
            'area_sqm' => fake()->numberBetween(400, 40_000),
            'project_type' => fake()->randomElement(ProjectType::cases()),
            'completed_at' => fake()->dateTimeBetween("{$year}-01-01", "{$year}-12-31"),
            'is_active' => true,
            'is_featured' => false,
            'position' => fake()->numberBetween(0, 50),
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
}
