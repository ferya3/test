<?php

declare(strict_types=1);

use App\Support\Permissions;
use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Creates the `companies.*` permissions on installs that already exist.
 *
 * deploy/deploy.sh migrates but never re-seeds, and spatie's hasPermissionTo()
 * throws for a permission that does not exist rather than answering false. The
 * admin sidebar asks every resource's policy whether to show its link, so a
 * deploy that added the companies resource without these rows would 500 every
 * admin page for every role below Super Admin.
 *
 * Only the new rows are written; existing grants are left alone. A fresh
 * install gets the same result from RolePermissionSeeder, which reads the same
 * matrix.
 */
return new class extends Migration
{
    public function up(): void
    {
        $registrar = app(PermissionRegistrar::class);
        $registrar->forgetCachedPermissions();

        $names = array_map(
            static fn (string $ability): string => Permissions::name('companies', $ability),
            Permissions::matrix()['companies'],
        );

        foreach ($names as $name) {
            Permission::findOrCreate($name, 'web');
        }

        foreach (Permissions::forRoles() as $roleName => $granted) {
            $role = Role::query()->where('name', $roleName)->where('guard_name', 'web')->first();

            if ($role === null) {
                continue;
            }

            $role->givePermissionTo(array_values(array_intersect($names, $granted)));
        }

        $registrar->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::query()->where('name', 'like', 'companies.%')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
