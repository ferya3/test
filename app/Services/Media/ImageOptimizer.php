<?php

declare(strict_types=1);

namespace App\Services\Media;

use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\AvifEncoder;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\Encoders\PngEncoder;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;
use RuntimeException;
use Throwable;

/**
 * Produces the responsive AVIF/WebP derivatives the picture component serves.
 *
 * Runs on GD rather than Imagick because GD ships with the platform PHP here
 * and encodes both formats natively; the quality difference at these settings
 * does not justify an extra system dependency.
 */
class ImageOptimizer
{
    private readonly ImageManager $manager;

    public function __construct()
    {
        $this->manager = new ImageManager(new Driver);
    }

    /**
     * Reduce an oversized original before it is stored.
     *
     * Editors upload straight off a camera; keeping a 6000px master costs disk
     * and conversion time for a page that never renders wider than 2560.
     *
     * @return array{contents: string, width: int, height: int}
     */
    public function normaliseOriginal(string $contents, string $extension): array
    {
        $image = $this->decode($contents);
        $maxWidth = (int) config('media.max_original_width', 3000);

        if ($image->width() > $maxWidth) {
            $image->scaleDown(width: $maxWidth);
            $contents = $this->encode($image, $extension);
        }

        return [
            'contents' => $contents,
            'width' => $image->width(),
            'height' => $image->height(),
        ];
    }

    /**
     * @return array{width: int, height: int}
     */
    public function dimensions(string $contents): array
    {
        $image = $this->decode($contents);

        return ['width' => $image->width(), 'height' => $image->height()];
    }

    /**
     * Generate every configured derivative.
     *
     * A width is skipped when it is not smaller than the source, so a 900px
     * upload never produces a 1920px "variant" that is both larger in bytes and
     * blurrier than what it came from.
     *
     * @return array<string, array<string, string>> format => width => encoded bytes
     */
    public function derivatives(string $contents): array
    {
        $sourceWidth = $this->decode($contents)->width();

        /** @var list<int> $widths */
        $widths = config('media.widths', []);
        /** @var array<string, array{quality: int}> $formats */
        $formats = config('media.formats', []);

        $applicable = array_values(array_filter(
            $widths,
            static fn (int $width): bool => $width <= $sourceWidth,
        ));

        // A source narrower than every configured width still deserves modern
        // formats, so it is emitted at its own size.
        if ($applicable === []) {
            $applicable = [$sourceWidth];
        }

        $result = [];

        foreach ($applicable as $width) {
            foreach ($formats as $format => $options) {
                // Decoded per derivative: Intervention mutates in place, so
                // reusing one instance would resize an already-resized image.
                $result[$format][(string) $width] = $this->encode(
                    $this->decode($contents)->scaleDown(width: $width),
                    $format,
                    (int) ($options['quality'] ?? 80),
                );
            }
        }

        return $result;
    }

    private function decode(string $contents): ImageInterface
    {
        $this->assertWithinPixelBudget($contents);

        try {
            return $this->manager->decodeBinary($contents);
        } catch (Throwable $exception) {
            throw new RuntimeException('The file could not be read as an image.', previous: $exception);
        }
    }

    /**
     * Reject a decompression bomb before GD is asked to allocate for it.
     *
     * The upload size cap measures compressed bytes, which is the wrong
     * dimension: a 65-byte PNG can declare 30000x30000 in its IHDR and cost
     * ~3.4 GB to decode. getimagesizefromstring() reads only the header, so
     * the dimensions are known without allocating the bitmap.
     *
     * Enforced here rather than at the upload boundary because every decode in
     * this class funnels through this method — including the ones the queued
     * conversion job makes, where an exhausted worker is nobody's HTTP error.
     */
    private function assertWithinPixelBudget(string $contents): void
    {
        $info = @getimagesizefromstring($contents);

        if ($info === false) {
            throw new RuntimeException('The file could not be read as an image.');
        }

        [$width, $height] = $info;
        $megapixels = ($width * $height) / 1_000_000;
        $budget = (float) config('media.max_megapixels', 50);

        if ($megapixels > $budget) {
            throw new RuntimeException(sprintf(
                'The image is %.1f megapixels (%dx%d), above the %.0f megapixel limit.',
                $megapixels,
                $width,
                $height,
                $budget,
            ));
        }
    }

    private function encode(ImageInterface $image, string $format, int $quality = 82): string
    {
        $encoder = match (strtolower($format)) {
            'avif' => new AvifEncoder(quality: $quality),
            'webp' => new WebpEncoder(quality: $quality),
            'png' => new PngEncoder,
            default => new JpegEncoder(quality: $quality, progressive: true),
        };

        return (string) $image->encode($encoder);
    }
}
