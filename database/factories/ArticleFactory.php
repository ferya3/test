<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Article;
use App\Models\ArticleCategory;
use App\Support\Enums\ArticleStatus;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Article>
 */
class ArticleFactory extends Factory
{
    use MakesTranslations;

    protected $model = Article::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $index = fake()->unique()->numberBetween(1, 99999);

        return [
            'article_category_id' => ArticleCategory::factory(),
            'title' => $this->bilingual(
                "راهنمای انتخاب پنل کابینت {$index}",
                "How to choose cabinet panels {$index}",
            ),
            'excerpt' => $this->bilingual(
                'آنچه پیش از خرید پنل کابینت باید بدانید.',
                'What to know before specifying cabinet panels.',
            ),
            'body' => $this->bilingual($this->faParagraph(6), fake()->paragraphs(4, true)),
            'cover_media_id' => null,
            'author_id' => null,
            'reading_time' => fake()->numberBetween(3, 12),
            'status' => ArticleStatus::Published,
            'published_at' => now()->subDays(fake()->numberBetween(0, 500)),
            'is_featured' => false,
        ];
    }

    public function draft(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => ArticleStatus::Draft,
            'published_at' => null,
        ]);
    }

    public function archived(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => ArticleStatus::Archived,
        ]);
    }

    /**
     * Published status but a future date — must stay off the public index.
     */
    public function scheduled(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => ArticleStatus::Published,
            'published_at' => now()->addWeek(),
        ]);
    }

    public function featured(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_featured' => true,
        ]);
    }
}
