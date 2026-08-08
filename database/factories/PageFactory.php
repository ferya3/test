<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Page;
use App\Support\Enums\PageTemplate;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Page>
 */
class PageFactory extends Factory
{
    use MakesTranslations;

    protected $model = Page::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $en = fake()->unique()->words(3, true);

        return [
            'slug' => Str::slug($en),
            'template' => PageTemplate::Default,
            'title' => $this->bilingual('درباره کارخانه', Str::title($en)),
            'subtitle' => $this->bilingual(
                'تولید پنل کابینت و پنل تزئینی',
                'Cabinet and decorative panel manufacturing',
            ),
            'body' => $this->bilingual($this->faParagraph(4), fake()->paragraphs(2, true)),
            'hero_media_id' => null,
            'is_active' => true,
            'position' => fake()->numberBetween(0, 20),
        ];
    }

    public function template(PageTemplate $template): static
    {
        return $this->state(fn (array $attributes): array => [
            'template' => $template,
        ]);
    }

    public function slug(string $slug): static
    {
        return $this->state(fn (array $attributes): array => [
            'slug' => $slug,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
