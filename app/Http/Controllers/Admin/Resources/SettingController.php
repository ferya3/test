<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function index(): View
    {
        $this->authorize('viewAny', Setting::class);

        return view('admin.settings.index', [
            'groups' => Setting::query()->orderBy('group')->orderBy('key')->get()->groupBy('group'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $this->authorize('update', Setting::class);

        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*' => ['nullable'],
        ]);

        // Only keys that already exist are written: settings are defined by the
        // seeder, so a crafted payload cannot introduce new ones.
        $existing = Setting::query()
            ->whereIn('key', array_keys($validated['settings']))
            ->get()
            ->keyBy('key');

        foreach ($validated['settings'] as $key => $value) {
            $setting = $existing->get($key);

            if ($setting === null) {
                continue;
            }

            // Saved through the model rather than the query builder: the
            // builder would bypass both the JSON cast on `value` and the
            // observer that invalidates the cached settings blob.
            $setting->value = $this->normalise($value);
            $setting->save();
        }

        return back()->with('status', __('admin.saved'));
    }

    /**
     * Translatable settings arrive as an array keyed by locale; scalars arrive
     * as strings. Empty strings become null so an unset value is genuinely unset.
     */
    private function normalise(mixed $value): mixed
    {
        if (is_array($value)) {
            $filtered = array_filter($value, static fn ($item): bool => $item !== null && $item !== '');

            return $filtered === [] ? null : $filtered;
        }

        return $value === '' ? null : $value;
    }
}
