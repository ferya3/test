<?php

declare(strict_types=1);

namespace App\Services\Media;

use App\Jobs\GenerateMediaConversions;
use App\Models\Media;
use App\Models\User;
use App\Support\Enums\MediaCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The single entry point for getting a file into the system.
 *
 * Nothing the client says about a file is believed: the MIME type is detected
 * from the file's own bytes, the extension is derived from that detected type
 * rather than from the submitted filename, and the stored name is generated
 * rather than taken from input. An upload that sniffs as an image but is named
 * "shell.php" is stored as a .jpg with a random name, or rejected outright.
 */
class MediaService
{
    public function __construct(private readonly ImageOptimizer $optimizer) {}

    /**
     * Store an uploaded file and queue its conversions.
     *
     * @param  array<string, mixed>  $attributes  translatable alt/title/caption
     *
     * @throws RuntimeException when the file is not an accepted type
     */
    public function store(
        UploadedFile $file,
        MediaCollection $collection = MediaCollection::General,
        array $attributes = [],
        ?User $uploader = null,
    ): Media {
        $contents = (string) file_get_contents($file->getRealPath());

        // Detected from content, not from the client-supplied header.
        $mimeType = $this->detectMimeType($file->getRealPath());
        $accepted = $this->acceptedType($mimeType);

        $this->assertWithinSizeLimit($contents, $accepted['kind']);

        $extension = $accepted['extension'];
        $this->assertExtensionAllowed($extension);

        $checksum = hash('sha256', $contents);

        // Re-uploading the same file returns what is already stored rather than
        // filling the disk with duplicates of the same photograph.
        $existing = Media::query()->where('checksum', $checksum)->first();

        if ($existing !== null) {
            return $existing;
        }

        $isImage = $accepted['kind'] === 'image';
        $width = null;
        $height = null;

        if ($isImage) {
            $normalised = $this->optimizer->normaliseOriginal($contents, $extension);
            $contents = $normalised['contents'];
            $width = $normalised['width'];
            $height = $normalised['height'];
        }

        $disk = $isImage
            ? (string) config('media.image_disk')
            : (string) config('media.document_disk');

        // Generated name: the submitted filename never reaches the filesystem.
        $path = sprintf(
            '%s/%s.%s',
            $collection->value,
            Str::uuid()->toString(),
            $extension,
        );

        Storage::disk($disk)->put($path, $contents);

        $media = new Media([
            'disk' => $disk,
            'path' => $path,
            // Kept for display and for the download filename, but sanitised.
            'filename' => $this->safeFilename($file->getClientOriginalName(), $extension),
            'mime_type' => $mimeType,
            'extension' => $extension,
            'size' => strlen($contents),
            'width' => $width,
            'height' => $height,
            'collection' => $collection,
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->getKey(),
            ...$attributes,
        ]);

        $media->save();

        if ($isImage) {
            $this->queueConversions($media);
        }

        return $media;
    }

    /**
     * Generate and persist the derivative set for an image.
     *
     * Called from the queued job, and directly when conversions are configured
     * to run synchronously.
     */
    public function generateConversions(Media $media): void
    {
        if (! $media->isImage()) {
            return;
        }

        $disk = Storage::disk($media->disk);

        if (! $disk->exists($media->path)) {
            return;
        }

        $contents = (string) $disk->get($media->path);
        $conversions = [];

        foreach ($this->optimizer->derivatives($contents) as $format => $variants) {
            foreach ($variants as $width => $encoded) {
                $path = $this->conversionPath($media, $format, (int) $width);

                $disk->put($path, $encoded);
                $conversions[$format][(string) $width] = $path;
            }
        }

        $media->forceFill(['conversions' => $conversions])->save();
    }

    /**
     * Delete a media record together with every file it owns.
     */
    public function delete(Media $media): void
    {
        DB::transaction(function () use ($media): void {
            $this->deleteFiles($media);

            $media->forceDelete();
        });
    }

    public function deleteFiles(Media $media): void
    {
        $disk = Storage::disk($media->disk);

        foreach ($media->conversions ?? [] as $variants) {
            foreach ($variants as $path) {
                $disk->delete($path);
            }
        }

        $disk->delete($media->path);
    }

    private function queueConversions(Media $media): void
    {
        if (config('media.process_synchronously')) {
            $this->generateConversions($media);

            return;
        }

        // Off-request: encoding six widths in two formats takes seconds, which
        // has no business happening inside an admin form submission.
        GenerateMediaConversions::dispatch($media);
    }

    private function conversionPath(Media $media, string $format, int $width): string
    {
        $base = preg_replace('/\.[^.]+$/', '', $media->path);

        return "{$base}-{$width}.{$format}";
    }

    private function detectMimeType(string $path): string
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);

        if ($finfo === false) {
            throw new RuntimeException('The file type could not be determined.');
        }

        $mimeType = finfo_file($finfo, $path);
        finfo_close($finfo);

        if ($mimeType === false) {
            throw new RuntimeException('The file type could not be determined.');
        }

        return $mimeType;
    }

    /**
     * @return array{extension: string, kind: string}
     */
    private function acceptedType(string $mimeType): array
    {
        /** @var array<string, array{extension: string, kind: string}> $accepted */
        $accepted = config('media.accepted', []);

        if (! isset($accepted[$mimeType])) {
            throw new RuntimeException("Files of type {$mimeType} are not accepted.");
        }

        return $accepted[$mimeType];
    }

    private function assertExtensionAllowed(string $extension): void
    {
        $forbidden = array_map('strtolower', (array) config('media.forbidden_extensions', []));

        if (in_array(strtolower($extension), $forbidden, true)) {
            throw new RuntimeException("The .{$extension} extension is not allowed.");
        }
    }

    private function assertWithinSizeLimit(string $contents, string $kind): void
    {
        $maxKilobytes = (int) config("media.max_size.{$kind}", 8192);

        if (strlen($contents) > $maxKilobytes * 1024) {
            throw new RuntimeException("The file exceeds the {$maxKilobytes} KB limit.");
        }
    }

    /**
     * Keep a readable original name for display and downloads, with anything
     * that could matter to a filesystem or a browser stripped out.
     */
    private function safeFilename(?string $original, string $extension): string
    {
        $base = pathinfo((string) $original, PATHINFO_FILENAME);
        $base = Str::of($base)
            ->replaceMatches('/[^\p{L}\p{N}\-_ ]+/u', '')
            ->squish()
            ->limit(80, '')
            ->toString();

        return ($base === '' ? 'file' : $base).'.'.$extension;
    }
}
