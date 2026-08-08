<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Support\Enums\RoleName;
use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent: re-running reconciles the permission set and each role's grants
 * against App\Support\Permissions, so adding a resource is a one-line change
 * there followed by a re-seed.
 */
class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (Permissions::all() as $name) {
            Permission::findOrCreate($name, 'web');
        }

        // Super Admin holds no explicit permissions: a Gate::before rule in
        // AuthServiceProvider short-circuits every check, so future resources
        // are covered without a re-seed.
        Role::findOrCreate(RoleName::SuperAdmin->value, 'web');

        foreach (Permissions::forRoles() as $roleName => $permissions) {
            Role::findOrCreate($roleName, 'web')->syncPermissions($permissions);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
