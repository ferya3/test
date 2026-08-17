<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\Page;
use App\Models\Setting;
use App\Services\Admin\SiteImageRegistry;
use App\Support\Data\SiteImageSlot;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * One screen for every fixed image on the site.
 *
 * Authorisation is per slot rather than per screen. The two storage shapes sit
 * behind different policies — an Editor may edit pages but not settings — and
 * gating the whole screen on either one would hide slots the operator is
 * entitled to change, or offer slots that would be refused on save.
 */
class SiteImageController extends Controller
{
    public function __construct(private readonly SiteImageRegistry $registry) {}

    public function index(): View
    {
        $slots = array_values(array_filter(
            $this->registry->slots(),
            fn (SiteImageSlot $slot): bool => $this->canEdit($slot),
        ));

        abort_if($slots === [], 403);

        $current = $this->registry->current();

        return view('admin.site-images.index', [
            'slots' => $slots,
            'current' => $current,
            'media' => $this->registry->mediaFor($current),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'images' => ['required', 'array'],
            'images.*' => ['nullable', 'integer', 'exists:media,id'],
        ]);

        $slots = $this->registry->slotsByKey();
        $saved = 0;

        foreach ($validated['images'] as $key => $mediaId) {
            $slot = $slots[$key] ?? null;

            // Unknown keys are ignored rather than rejected: the slot list is
            // the definition, so a stale form field cannot introduce one.
            if ($slot === null || ! $this->canEdit($slot)) {
                continue;
            }

            $this->registry->assign($slot, $mediaId === null ? null : (int) $mediaId);
            $saved++;
        }

        abort_if($saved === 0, 403);

        return back()->with('status', __('admin.saved'));
    }

    /**
     * A page hero is authorised by the Page policy, the homepage hero by the
     * Setting policy — and both additionally require the media library, since
     * every value here is a reference into it.
     */
    private function canEdit(SiteImageSlot $slot): bool
    {
        $user = auth()->user();

        if ($user === null || ! $user->can('viewAny', Media::class)) {
            return false;
        }

        // A bare instance, not the class name: Gate strips a class-name
        // argument, and ResourcePolicy::update() requires a model — the trap
        // that made saving the settings form 500. ResourcePolicy decides on the
        // permission matrix alone, so an unsaved instance is enough.
        return $slot->source === 'page'
            ? $user->can('update', new Page)
            : $user->can('update', new Setting);
    }
}
