<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Article;
use App\Models\Catalog;
use App\Models\Category;
use App\Models\Certificate;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Page;
use App\Models\Product;
use App\Models\Project;
use App\Services\Media\MediaService;
use App\Support\Enums\MediaCollection;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;

/**
 * Generates neutral placeholder imagery and attaches it to seeded content.
 *
 * These are flat geometric plates in the brand palette, not stand-ins
 * pretending to be photographs — the point is to exercise the real conversion
 * pipeline and give the layout genuine dimensions to reserve, so that swapping
 * in the factory's own photography changes nothing but the pixels.
 */
class GeneratePlaceholderMedia extends Command
{
    protected $signature = 'media:placeholders
        {--fresh : Replace imagery that is already attached}';

    protected $description = 'Generate placeholder imagery for seeded content';

    /**
     * Brand palette, so placeholders look like the site rather than like
     * missing assets.
     *
     * @var list<array{0: int, 1: int, 2: int}>
     */
    private const array PALETTE = [
        [30, 34, 38],    // ink-800
        [44, 49, 54],    // ink-700
        [94, 101, 107],  // ink-500
        [194, 98, 15],   // amber-500
        [205, 210, 214], // ink-200
        [219, 124, 30],  // amber-400
    ];

    public function handle(MediaService $media): int
    {
        if (app()->isProduction() && ! $this->option('fresh')) {
            $this->error('Refusing to generate placeholder imagery in production.');

            return self::FAILURE;
        }

        // Encoding inline: waiting is the point of this command.
        config()->set('media.process_synchronously', true);

        $targets = [
            [Product::class, 'main_media_id', MediaCollection::Products, 1600, 1200],
            [Category::class, 'cover_media_id', MediaCollection::Categories, 1600, 1067],
            [Project::class, 'cover_media_id', MediaCollection::Projects, 1600, 1200],
            [Article::class, 'cover_media_id', MediaCollection::Articles, 1600, 900],
            [Certificate::class, 'media_id', MediaCollection::Certificates, 1200, 1600],
            [Catalog::class, 'cover_media_id', MediaCollection::Catalogs, 1200, 1600],
            [Page::class, 'hero_media_id', MediaCollection::Pages, 2400, 1350],
            [Decor::class, 'media_id', MediaCollection::Decors, 1200, 900],
            [Color::class, 'media_id', MediaCollection::Colors, 800, 800],
        ];

        $created = 0;

        foreach ($targets as [$class, $column, $collection, $width, $height]) {
            $created += $this->attach($media, $class, $column, $collection, $width, $height);
        }

        $this->newLine();
        $this->info("Attached {$created} placeholder images.");
        $this->comment('Replace these with the factory\'s own photography before launch.');

        return self::SUCCESS;
    }

    /**
     * @param  class-string<Model>  $class
     */
    private function attach(
        MediaService $media,
        string $class,
        string $column,
        MediaCollection $collection,
        int $width,
        int $height,
    ): int {
        $query = $class::query();

        if (! $this->option('fresh')) {
            $query->whereNull($column);
        }

        $records = $query->get();

        if ($records->isEmpty()) {
            return 0;
        }

        $label = class_basename($class);
        $bar = $this->output->createProgressBar($records->count());
        $bar->setFormat(" {$label}: %current%/%max% [%bar%]");
        $bar->start();

        $count = 0;

        foreach ($records as $index => $record) {
            $file = $this->plate($width, $height, $index);

            $image = $media->store($file, $collection, [
                'alt' => [
                    'fa' => 'تصویر نمونه',
                    'en' => 'Placeholder image',
                ],
            ]);

            $record->forceFill([$column => $image->getKey()])->save();

            @unlink($file->getRealPath());
            $count++;
            $bar->advance();
        }

        $bar->finish();
        $this->newLine();

        return $count;
    }

    /**
     * A flat two-tone plate with an offset band — enough visual structure to
     * see cropping and aspect ratios without pretending to be a photograph.
     */
    private function plate(int $width, int $height, int $seed): UploadedFile
    {
        $image = imagecreatetruecolor($width, $height);

        $background = self::PALETTE[$seed % count(self::PALETTE)];
        $foreground = self::PALETTE[($seed + 3) % count(self::PALETTE)];

        imagefill($image, 0, 0, imagecolorallocate($image, ...$background));

        // Diagonal band, positioned from the seed so consecutive cards differ.
        $offset = (int) ($width * (0.25 + (($seed % 5) * 0.1)));
        $band = imagecolorallocate($image, ...$foreground);

        imagefilledpolygon($image, [
            $offset, 0,
            $offset + (int) ($width * 0.22), 0,
            $offset - (int) ($width * 0.1), $height,
            $offset - (int) ($width * 0.32), $height,
        ], $band);

        $path = tempnam(sys_get_temp_dir(), 'placeholder').'.jpg';
        imagejpeg($image, $path, 88);
        imagedestroy($image);

        return new UploadedFile($path, 'placeholder.jpg', null, null, true);
    }
}
