<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Services\Media\MediaService;
use App\Support\Enums\MediaCollection;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * The media library.
 *
 * Uploads are size-limited by Laravel's validator *and* by MediaService, which
 * re-checks the real MIME type from the file's bytes. The validator here is a
 * courtesy that produces a readable error; the service is the actual boundary.
 */
class MediaController extends Controller
{
    public function index(Request $request): View
    {
        $this->authorize('viewAny', Media::class);

        $collection = $request->string('collection')->toString();

        return view('admin.media.index', [
            'media' => Media::query()
                ->when(
                    MediaCollection::tryFrom($collection) !== null,
                    fn ($query) => $query->where('collection', $collection),
                )
                ->when(
                    $request->filled('q'),
                    fn ($query) => $query->where('filename', 'like', '%'.addcslashes((string) $request->string('q'), '%_\\').'%'),
                )
                ->with('uploader:id,name')
                ->latest('id')
                ->paginate(36)
                ->withQueryString(),
            'collections' => MediaCollection::cases(),
            'activeCollection' => $collection,
        ]);
    }

    public function store(Request $request, MediaService $media): RedirectResponse|JsonResponse
    {
        $this->authorize('create', Media::class);

        $maxKb = max(
            (int) config('media.max_size.image'),
            (int) config('media.max_size.document'),
        );

        $request->validate([
            'file' => ['required', 'file', "max:{$maxKb}"],
            'collection' => ['required', Rule::enum(MediaCollection::class)],
        ]);

        try {
            $record = $media->store(
                $request->file('file'),
                MediaCollection::from((string) $request->string('collection')),
                uploader: $request->user(),
            );
        } catch (RuntimeException $exception) {
            // The service rejects by real content type, so this is where a
            // disguised upload surfaces as a validation error.
            return back()->withErrors(['file' => $exception->getMessage()]);
        }

        if ($request->wantsJson()) {
            return response()->json([
                'id' => $record->getKey(),
                'url' => $record->url(),
                'filename' => $record->filename,
            ]);
        }

        return back()->with('status', __('admin.uploaded'));
    }

    public function update(Request $request, Media $medium): RedirectResponse
    {
        $this->authorize('update', $medium);

        $validated = $request->validate([
            'alt' => ['nullable', 'array'],
            'alt.*' => ['nullable', 'string', 'max:500'],
            'title' => ['nullable', 'array'],
            'title.*' => ['nullable', 'string', 'max:190'],
        ]);

        $medium->update($validated);

        return back()->with('status', __('admin.saved'));
    }

    public function destroy(Media $medium, MediaService $media): RedirectResponse
    {
        $this->authorize('delete', $medium);

        // Deletes the original and every derivative, not just the row.
        $media->delete($medium);

        return redirect()
            ->route('admin.media.index')
            ->with('status', __('admin.deleted'));
    }
}
