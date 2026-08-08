<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Page;
use App\Models\PageSection;
use App\Support\Enums\PageSectionType;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PageSection>
 */
class PageSectionFactory extends Factory
{
    use MakesTranslations;

    protected $model = PageSection::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'page_id' => Page::factory(),
            'type' => PageSectionType::Text,
            'heading' => $this->bilingual('خط تولید', 'Production Line'),
            'subheading' => null,
            'body' => $this->bilingual($this->faParagraph(3), fake()->paragraph()),
            'media_id' => null,
            'data' => null,
            'position' => fake()->numberBetween(0, 30),
            'is_active' => true,
        ];
    }

    public function ofType(PageSectionType $type): static
    {
        return $this->state(fn (array $attributes): array => [
            'type' => $type,
        ]);
    }

    public function step(int $number): static
    {
        return $this->state(fn (array $attributes): array => [
            'type' => PageSectionType::Step,
            'data' => ['step' => $number],
            'position' => $number,
        ]);
    }

    public function stat(string $value, string $labelFa, string $labelEn): static
    {
        return $this->state(fn (array $attributes): array => [
            'type' => PageSectionType::Stat,
            'heading' => $this->bilingual($labelFa, $labelEn),
            'body' => null,
            'data' => ['value' => $value],
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }
}
