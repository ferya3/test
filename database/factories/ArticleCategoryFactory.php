<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\ArticleCategory;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ArticleCategory>
 */
class ArticleCategoryFactory extends Factory
{
    use MakesTranslations;

    protected $model = ArticleCategory::class;

    /**
     * @var list<array{0: string, 1: string}>
     */
    private const array TOPICS = [
        ['راهنمای خرید', 'Buying Guides'],
        ['دانش فنی', 'Technical Knowledge'],
        ['طراحی داخلی', 'Interior Design'],
        ['اخبار کارخانه', 'Factory News'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        [$fa, $en] = self::TOPICS[array_rand(self::TOPICS)];
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
