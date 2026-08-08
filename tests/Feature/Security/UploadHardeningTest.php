<?php

declare(strict_types=1);

use App\Services\Media\ImageOptimizer;
use App\Services\Media\MediaService;
use App\Support\Enums\MediaCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function (): void {
    Storage::fake('media');
    Storage::fake('documents');

    config()->set('media.process_synchronously', true);

    $this->media = app(MediaService::class);
});

function uploadOf(string $contents, string $name): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'upl').'-'.$name;
    file_put_contents($path, $contents);

    return new UploadedFile($path, $name, test: true);
}

function rasterImage(int $width, int $height): string
{
    $image = imagecreatetruecolor($width, $height);
    imagefill($image, 0, 0, imagecolorallocate($image, 40, 44, 48));

    ob_start();
    imagejpeg($image, null, 85);
    imagedestroy($image);

    return (string) ob_get_clean();
}

/**
 * A PNG whose IHDR declares enormous dimensions while the file itself stays
 * tiny — the classic decompression bomb. Forged rather than generated, because
 * generating one honestly would cost the memory this test exists to protect.
 */
function decompressionBomb(int $width = 30000, int $height = 30000): string
{
    $chunk = static fn (string $type, string $data): string => pack('N', strlen($data))
        .$type.$data.pack('N', crc32($type.$data));

    $ihdr = pack('NN', $width, $height).chr(8).chr(2).chr(0).chr(0).chr(0);

    return "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', $ihdr)
        .$chunk('IDAT', (string) gzcompress(''))
        .$chunk('IEND', '');
}

describe('decompression bombs', function (): void {
    it('rejects an image whose decoded size would exhaust memory', function (): void {
        // 30000x30000 is 900 megapixels: roughly 3.4 GB once GD holds it at
        // four bytes a pixel, from a file of a few dozen bytes.
        $bomb = decompressionBomb();

        expect(fn () => $this->media->store(uploadOf($bomb, 'bomb.png'), MediaCollection::General))
            ->toThrow(RuntimeException::class, 'megapixel');
    });

    it('is not caught by the byte-size cap alone', function (): void {
        // This is why the pixel budget exists: the compressed size says nothing
        // about the cost of decoding, so the KB limit waves the bomb straight
        // through.
        $bomb = decompressionBomb();
        $capBytes = (int) config('media.max_size.image') * 1024;

        expect(strlen($bomb))->toBeLessThan($capBytes);
    });

    it('stores nothing when it rejects one', function (): void {
        try {
            $this->media->store(uploadOf(decompressionBomb(), 'bomb.png'), MediaCollection::General);
        } catch (RuntimeException) {
            // expected
        }

        expect(Storage::disk('media')->allFiles())->toBeEmpty();
    });

    it('still accepts a large but legitimate photograph', function (): void {
        // A 24 MP camera upload must not be collateral damage.
        $media = $this->media->store(uploadOf(rasterImage(6000, 4000), 'photo.jpg'), MediaCollection::Products);

        expect($media->width)->toBe(3000)  // scaled down to max_original_width
            ->and($media->exists)->toBeTrue();
    });

    it('applies the budget to the queued conversion path too', function (): void {
        // generateConversions() decodes from disk, well after the upload
        // request has ended — an exhausted queue worker is nobody's HTTP error.
        config()->set('media.max_megapixels', 1);

        expect(fn () => app(ImageOptimizer::class)->derivatives(rasterImage(2000, 2000)))
            ->toThrow(RuntimeException::class, 'megapixel');
    });
});

describe('type enforcement', function (): void {
    it('rejects a PHP script renamed to look like an image', function (): void {
        expect(fn () => $this->media->store(
            uploadOf('<?php system($_GET["c"]); ?>', 'shell.jpg'),
            MediaCollection::General,
        ))->toThrow(RuntimeException::class);
    });

    it('rejects SVG, which can carry script', function (): void {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

        expect(fn () => $this->media->store(uploadOf($svg, 'x.svg'), MediaCollection::General))
            ->toThrow(RuntimeException::class);
    });

    it('never lets the submitted filename reach the filesystem', function (): void {
        $media = $this->media->store(
            uploadOf(rasterImage(400, 300), 'shell.php.jpg'),
            MediaCollection::General,
        );

        expect($media->path)->not->toContain('shell')
            ->and($media->path)->toEndWith('.jpg')
            ->and(Str::isUuid(basename($media->path, '.jpg')))->toBeTrue();
    });

    it('derives the extension from the detected type, not the submitted name', function (): void {
        $media = $this->media->store(
            uploadOf(rasterImage(400, 300), 'actually-a-jpeg.png'),
            MediaCollection::General,
        );

        expect($media->extension)->toBe('jpg')
            ->and($media->mime_type)->toBe('image/jpeg');
    });
});

it('keeps gated documents off any publicly reachable disk', function (): void {
    // The catalogue download route is only a gate if the file has no public URL
    // to guess around it.
    expect(config('media.document_disk'))->toBe('documents')
        ->and(config('filesystems.disks.documents.url' ?? ''))->toBeNull()
        ->and(config('filesystems.disks.documents.root'))->toContain('private');
});
