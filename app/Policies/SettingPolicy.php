<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class SettingPolicy extends ResourcePolicy
{
    protected function resource(): string
    {
        return 'settings';
    }

    /**
     * Settings are edited as a whole, never one row at a time, so there is no
     * instance to authorise against and the panel asks with a class name:
     * `authorize('update', Setting::class)`.
     *
     * Gate strips a class-name argument before invoking the policy, which left
     * ResourcePolicy::update() — declared with a required Model — being called
     * with only the user. Saving the settings form raised ArgumentCountError
     * and returned 500 every time; nothing covered it, because every other
     * resource authorises against a record it has just loaded.
     *
     * Widening the parameter here rather than in ResourcePolicy keeps every
     * per-record resource strict about being asked with a record.
     */
    public function update(User $user, ?Model $model = null): bool
    {
        return parent::update($user, $model ?? new Setting);
    }
}
