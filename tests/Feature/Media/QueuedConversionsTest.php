<?php

declare(strict_types=1);

use App\Jobs\GenerateMediaConversions;
use App\Models\Media;
use App\Services\Media\MediaService;
use App\Support\Enums\MediaCollection;
use Illuminate\Http\UploadedFile;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

/**
 * The queued half of the media pipeline.
 *
 * MediaServiceTest sets media.process_synchronously so it can assert the
 * encoding itself, which means the *dispatch* was never asserted and the job
 * never round-tripped through serialisation. Production runs the redis queue,
 * where every job is serialised on the way in and rebuilt in a worker process
 * with none of the request's state — the same environment gap that produced
 * the stage-8 cache bug.
 */
beforeEach(function (): void {
    Storage::fake('media');
    Storage::fake('documents');

    // The default, restated: conversions belong off-request.
    config()->set('media.process_synchronously', false);
});

function imageUpload(int $width = 800, int $height = 600): UploadedFile
{
    $image = imagecreatetruecolor($width, $height);
    imagefill($image, 0, 0, imagecolorallocate($image, 40, 44, 48));

    $path = tempnam(sys_get_temp_dir(), 'img').'.jpg';
    imagejpeg($image, $path, 90);
    imagedestroy($image);

    return new UploadedFile($path, 'photo.jpg', test: true);
}

it('queues conversions instead of encoding them in the request', function (): void {
    Queue::fake();

    $media = app(MediaService::class)->store(imageUpload(), MediaCollection::Products);

    Queue::assertPushed(
        GenerateMediaConversions::class,
        fn (GenerateMediaConversions $job): bool => $job->media->is($media),
    );
});

it('does not queue conversions for a document', function (): void {
    Queue::fake();

    $pdf = tempnam(sys_get_temp_dir(), 'doc').'.pdf';
    file_put_contents($pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

    app(MediaService::class)->store(
        new UploadedFile($pdf, 'catalogue.pdf', test: true),
        MediaCollection::Catalogs,
    );

    Queue::assertNothingPushed();
});

it('survives serialisation and still resolves its model', function (): void {
    // What the redis queue actually does to a job. SerializesModels stores the
    // key, not the model, so this also proves the worker re-reads a fresh row
    // rather than one frozen at dispatch time.
    $media = Media::factory()->create();

    $job = new GenerateMediaConversions($media);
    $revived = unserialize(serialize($job));

    expect($revived)->toBeInstanceOf(GenerateMediaConversions::class)
        ->and($revived->media->getKey())->toBe($media->getKey())
        ->and($revived->media->path)->toBe($media->path);
});

it('produces the derivatives when the worker runs it', function (): void {
    $media = app(MediaService::class)->store(imageUpload(1600, 1200), MediaCollection::Products);

    expect($media->conversions)->toBeNull();

    // Stand in for the worker.
    (new GenerateMediaConversions($media))->handle(app(MediaService::class));

    $conversions = $media->fresh()->conversions;

    expect($conversions)->toBeArray()
        ->and($conversions)->toHaveKeys(['avif', 'webp']);
});

it('holds a lock so two workers cannot encode the same image at once', function (): void {
    // Both would write the same paths and race on the conversions column.
    $middleware = (new GenerateMediaConversions(Media::factory()->create()))->middleware();

    expect($middleware)->toHaveCount(1)
        ->and($middleware[0])->toBeInstanceOf(WithoutOverlapping::class);
});

it('gives up quietly when the media row was deleted before the worker reached it', function (): void {
    // Otherwise the job burns all three attempts against a missing model.
    expect((new GenerateMediaConversions(Media::factory()->create()))->deleteWhenMissingModels)->toBeTrue();
});
