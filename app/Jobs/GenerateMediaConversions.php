<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Media;
use App\Services\Media\MediaService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;

/**
 * Encodes an image into every responsive AVIF/WebP derivative.
 *
 * Off-request because encoding six widths in two formats takes seconds — time
 * that has no business being spent inside an admin form submission.
 */
class GenerateMediaConversions implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 300;

    /**
     * A media record deleted before the worker reached it is not a failure —
     * without this the job would retry three times against a missing model.
     */
    public bool $deleteWhenMissingModels = true;

    /**
     * Retry with increasing delay; a transient disk problem should not burn
     * all three attempts inside a second.
     *
     * @var list<int>
     */
    public array $backoff = [10, 60];

    public function __construct(public readonly Media $media) {}

    public function handle(MediaService $media): void
    {
        $media->generateConversions($this->media);
    }

    /**
     * @return list<object>
     */
    public function middleware(): array
    {
        // Two workers encoding the same image would write the same paths and
        // race on the conversions column.
        return [(new WithoutOverlapping((string) $this->media->getKey()))->expireAfter(600)];
    }
}
