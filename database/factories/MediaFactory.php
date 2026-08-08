<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Media;
use App\Support\Enums\MediaCollection;
use Database\Factories\Concerns\MakesTranslations;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Media>
 */
class MediaFactory extends Factory
{
    use MakesTranslations;

    protected $model = Media::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = Str::slug(fake()->unique()->words(3, true));
        $width = fake()->randomElement([1600, 1920, 2400]);

        return [
            'disk' => 'media',
            'path' => "products/{$name}.jpg",
            'filename' => "{$name}.jpg",
            'mime_type' => 'image/jpeg',
            'extension' => 'jpg',
            'size' => fake()->numberBetween(120_000, 2_400_000),
            'width' => $width,
            'height' => (int) round($width / fake()->randomElement([1.5, 1.777, 1.333])),
            'alt' => $this->bilingual('تصویر پنل صنعتی', 'Industrial panel photograph'),
            'title' => $this->bilingual('پنل تزئینی', 'Decorative panel'),
            'collection' => MediaCollection::Products,
            'conversions' => $this->conversionsFor("products/{$name}"),
            'checksum' => hash('sha256', $name),
            'uploaded_by' => null,
        ];
    }

    public function inCollection(MediaCollection $collection): static
    {
        return $this->state(fn (array $attributes): array => [
            'collection' => $collection,
        ]);
    }

    /**
     * A PDF rather than an image — datasheets, catalogues, certificate scans.
     */
    public function pdf(): static
    {
        return $this->state(function (array $attributes): array {
            $name = Str::slug(fake()->unique()->words(3, true));

            return [
                'path' => "documents/{$name}.pdf",
                'filename' => "{$name}.pdf",
                'mime_type' => 'application/pdf',
                'extension' => 'pdf',
                'width' => null,
                'height' => null,
                'collection' => MediaCollection::Documents,
                'conversions' => null,
                'size' => fake()->numberBetween(400_000, 8_000_000),
            ];
        });
    }

    /**
     * No derivatives generated yet — the state a freshly uploaded file is in
     * before the conversion job runs.
     */
    public function withoutConversions(): static
    {
        return $this->state(fn (array $attributes): array => [
            'conversions' => null,
        ]);
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function conversionsFor(string $base): array
    {
        $widths = [320, 640, 960, 1280, 1920];
        $conversions = [];

        foreach (['webp', 'avif'] as $format) {
            foreach ($widths as $width) {
                $conversions[$format][(string) $width] = "{$base}-{$width}.{$format}";
            }
        }

        return $conversions;
    }
}
