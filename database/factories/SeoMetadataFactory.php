<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\SeoMetadata;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SeoMetadata>
 */
class SeoMetadataFactory extends Factory
{
    use MakesTranslations;

    protected $model = SeoMetadata::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => $this->bilingual(
                'پنل کابینت و پنل تزئینی | کارخانه',
                'Cabinet and Decorative Panels | Factory',
            ),
            'description' => $this->bilingual(
                'تولیدکننده پنل کابینت آشپزخانه و پنل تزئینی با کیفیت صادراتی.',
                'Manufacturer of kitchen cabinet panels and decorative panels.',
            ),
            'keywords' => $this->bilingual(
                'پنل کابینت، ام‌دی‌اف، های‌گلاس',
                'cabinet panel, MDF, high gloss',
            ),
            'canonical_url' => null,
            'og_title' => null,
            'og_description' => null,
            'og_media_id' => null,
            'twitter_card' => 'summary_large_image',
            'robots' => 'index,follow',
            'structured_data' => null,
        ];
    }

    public function noindex(): static
    {
        return $this->state(fn (array $attributes): array => [
            'robots' => 'noindex,nofollow',
        ]);
    }
}
