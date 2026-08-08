<?php

declare(strict_types=1);

use App\Models\Media;
use App\Models\User;
use App\Services\Media\MediaService;
use App\Support\Enums\MediaCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    Storage::fake('media');
    Storage::fake('documents');

    // Conversions are normally queued; here the encoding itself is the subject.
    config()->set('media.process_synchronously', true);

    $this->media = app(MediaService::class);
});

/**
 * A real raster image, not a text file with an image extension — the service
 * detects type from content, so a fake would be rejected exactly as intended.
 */
function realImage(int $width = 1600, int $height = 1200, string $format = 'jpg'): UploadedFile
{
    $image = imagecreatetruecolor($width, $height);
    imagefill($image, 0, 0, imagecolorallocate($image, 40, 44, 48));
    imagefilledrectangle($image, 0, 0, (int) ($width / 2), $height, imagecolorallocate($image, 194, 98, 15));

    $path = tempnam(sys_get_temp_dir(), 'img').".{$format}";

    match ($format) {
        'png' => imagepng($image, $path),
        'webp' => imagewebp($image, $path),
        default => imagejpeg($image, $path, 90),
    };

    imagedestroy($image);

    return new UploadedFile($path, "photo.{$format}", null, null, true);
}

function fakePdf(): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'doc').'.pdf';
    file_put_contents($path, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

    return new UploadedFile($path, 'catalogue.pdf', null, null, true);
}

describe('storing an image', function (): void {
    it('records dimensions so every img can reserve its space', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products);

        expect($media->width)->toBe(1600)
            ->and($media->height)->toBe(1200)
            ->and($media->mime_type)->toBe('image/jpeg');
    });

    it('puts images on the public disk', function (): void {
        $media = $this->media->store(realImage(), MediaCollection::Products);

        expect($media->disk)->toBe('media');
        Storage::disk('media')->assertExists($media->path);
    });

    it('generates a stored name instead of using the submitted one', function (): void {
        $media = $this->media->store(realImage(), MediaCollection::Products);

        // The submitted filename never reaches the filesystem.
        expect($media->path)->not->toContain('photo')
            ->and($media->path)->toStartWith('products/')
            ->and($media->path)->toEndWith('.jpg');
    });

    it('scales an oversized original down', function (): void {
        $media = $this->media->store(realImage(4200, 3000), MediaCollection::Products);

        expect($media->width)->toBe((int) config('media.max_original_width'));
    });

    it('returns the existing record when the same file is uploaded twice', function (): void {
        $first = $this->media->store(realImage(800, 600), MediaCollection::Products);
        $second = $this->media->store(realImage(800, 600), MediaCollection::Products);

        expect($second->id)->toBe($first->id)
            ->and(Media::count())->toBe(1);
    });
});

describe('conversions', function (): void {
    it('produces AVIF and WebP derivatives', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products);

        expect($media->fresh()->conversions)->toHaveKeys(['avif', 'webp']);
    });

    it('writes files that are genuinely in those formats', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products)->fresh();

        foreach (['avif' => 'image/avif', 'webp' => 'image/webp'] as $format => $expected) {
            $path = $media->conversions[$format]['640'];

            Storage::disk('media')->assertExists($path);

            $bytes = Storage::disk('media')->get($path);
            $detected = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);

            expect($detected)->toBe($expected);
        }
    });

    it('does not upscale beyond the source width', function (): void {
        // A 900px upload must not produce a 1920px "variant" that is larger in
        // bytes and blurrier than what it came from.
        $media = $this->media->store(realImage(900, 600), MediaCollection::Products)->fresh();

        expect($media->conversionWidths('webp'))->each->toBeLessThanOrEqual(900);
    });

    it('still emits modern formats for a source smaller than every configured width', function (): void {
        $media = $this->media->store(realImage(200, 150), MediaCollection::Products)->fresh();

        expect($media->conversions)->toHaveKey('webp')
            ->and($media->conversionWidths('webp'))->toBe([200]);
    });

    it('builds a srcset the picture component can use', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products)->fresh();

        expect($media->srcset('avif'))->toContain('640w')->toContain('1280w');
    });

    it('produces smaller files than the original', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products)->fresh();

        $webp = strlen(Storage::disk('media')->get($media->conversions['webp']['1280']));

        expect($webp)->toBeLessThan($media->size);
    });
});

describe('documents', function (): void {
    it('stores a PDF on the private disk', function (): void {
        $media = $this->media->store(fakePdf(), MediaCollection::Documents);

        expect($media->disk)->toBe('documents')
            ->and($media->mime_type)->toBe('application/pdf');

        Storage::disk('documents')->assertExists($media->path);
        // A private disk has no public URL, so the gated download cannot be
        // sidestepped by guessing the storage path.
        Storage::disk('media')->assertMissing($media->path);
    });

    it('generates no conversions for a document', function (): void {
        expect($this->media->store(fakePdf(), MediaCollection::Documents)->conversions)->toBeNull();
    });
});

describe('rejecting dangerous uploads', function (): void {
    it('rejects a PHP script renamed as an image', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'evil').'.jpg';
        file_put_contents($path, "<?php system(\$_GET['c']); ?>");

        expect(fn () => $this->media->store(
            new UploadedFile($path, 'photo.jpg', 'image/jpeg', null, true),
            MediaCollection::Products,
        ))->toThrow(RuntimeException::class);

        expect(Media::count())->toBe(0);
    });

    it('rejects SVG, which can carry script', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'svg').'.svg';
        file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

        expect(fn () => $this->media->store(
            new UploadedFile($path, 'logo.svg', 'image/svg+xml', null, true),
            MediaCollection::General,
        ))->toThrow(RuntimeException::class);
    });

    it('ignores a spoofed content type header', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'text').'.txt';
        file_put_contents($path, 'just text');

        // The client claims image/png; the bytes say otherwise.
        expect(fn () => $this->media->store(
            new UploadedFile($path, 'x.png', 'image/png', null, true),
            MediaCollection::General,
        ))->toThrow(RuntimeException::class);
    });

    it('enforces the size limit', function (): void {
        config()->set('media.max_size.image', 1);

        expect(fn () => $this->media->store(realImage(1600, 1200), MediaCollection::Products))
            ->toThrow(RuntimeException::class);
    });

    it('sanitises the retained original filename', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'img').'.jpg';
        $image = imagecreatetruecolor(100, 100);
        imagejpeg($image, $path);
        imagedestroy($image);

        $media = $this->media->store(
            new UploadedFile($path, '../../etc/passwd<script>.jpg', null, null, true),
            MediaCollection::General,
        );

        expect($media->filename)->not->toContain('..')
            ->not->toContain('/')
            ->not->toContain('<')
            ->toEndWith('.jpg');
    });
});

describe('deleting', function (): void {
    it('removes the original and every derivative', function (): void {
        $media = $this->media->store(realImage(1600, 1200), MediaCollection::Products)->fresh();

        $paths = [$media->path];

        foreach ($media->conversions as $variants) {
            $paths = [...$paths, ...array_values($variants)];
        }

        $this->media->delete($media);

        foreach ($paths as $path) {
            Storage::disk('media')->assertMissing($path);
        }

        expect(Media::withTrashed()->count())->toBe(0);
    });
});

it('records who uploaded a file', function (): void {
    $user = User::factory()->create();

    expect($this->media->store(realImage(), MediaCollection::Products, uploader: $user)->uploaded_by)
        ->toBe($user->id);
});
