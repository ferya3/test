<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Setting;
use App\Services\SettingsRepository;

/**
 * Settings are cached forever as a single blob, so any write must invalidate it
 * — otherwise an editor's change would never appear.
 */
class SettingObserver
{
    public function __construct(private readonly SettingsRepository $settings) {}

    public function saved(Setting $setting): void
    {
        $this->settings->flush();
    }

    public function deleted(Setting $setting): void
    {
        $this->settings->flush();
    }
}
