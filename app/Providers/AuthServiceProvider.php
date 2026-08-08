<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use App\Support\Enums\RoleName;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        /*
         * Super Admin passes every check. Granting the role each permission
         * individually would silently leave it short whenever a new resource is
         * added, so the role is expressed as a short-circuit instead.
         *
         * Returning null (rather than false) for everyone else lets the normal
         * policy and permission chain run.
         */
        Gate::before(function (User $user): ?bool {
            // A deactivated account is authorised for nothing at all.
            if (! $user->is_active) {
                return false;
            }

            return $user->hasRole(RoleName::SuperAdmin->value) ? true : null;
        });
    }
}
