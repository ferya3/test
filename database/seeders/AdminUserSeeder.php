<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use App\Support\Enums\RoleName;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Creates one account per role.
 *
 * Passwords are read from the environment when provided and otherwise generated
 * randomly and printed once — a seeder must never bake a known password into a
 * deployable artefact.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $this->assertEnvironmentIsReadable();

        $accounts = [
            [RoleName::SuperAdmin, 'SEED_SUPER_ADMIN_EMAIL', 'SEED_SUPER_ADMIN_PASSWORD', 'مدیر ارشد سیستم'],
            [RoleName::Admin, 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'مدیر سایت'],
            [RoleName::Editor, 'SEED_EDITOR_EMAIL', 'SEED_EDITOR_PASSWORD', 'ویرایشگر محتوا'],
            [RoleName::ProductManager, 'SEED_PRODUCT_MANAGER_EMAIL', 'SEED_PRODUCT_MANAGER_PASSWORD', 'مدیر محصول'],
        ];

        foreach ($accounts as [$role, $emailKey, $passwordKey, $name]) {
            $email = env($emailKey, "{$role->value}@example.com");
            $password = env($passwordKey);
            $generated = $password === null;

            $password ??= Str::password(20);

            $user = User::query()->firstOrNew(['email' => $email]);
            $wasNew = ! $user->exists;

            $user->fill([
                'name' => $name,
                'is_active' => true,
            ]);

            // Never silently reset the password of an account that already exists.
            if ($wasNew) {
                $user->password = Hash::make($password);
                $user->email_verified_at = now();
            }

            $user->save();
            $user->syncRoles([$role->value]);

            if ($wasNew && $generated) {
                $this->command?->warn("Created {$role->value}: {$email} / {$password}");
                $this->command?->warn('Store this password now — it is not recoverable.');
            } elseif ($wasNew) {
                $this->command?->info("Created {$role->value}: {$email} (password from {$passwordKey})");
            } else {
                $this->command?->info("Kept existing {$role->value}: {$email}");
            }
        }

        $this->command?->warn(
            'Privileged roles must enrol TOTP two-factor authentication on first sign-in.',
        );
    }

    /**
     * Refuse to run when configuration is cached.
     *
     * Once `php artisan optimize` has cached the config, Laravel stops parsing
     * .env, so every env() read here returns its default. On a re-run against a
     * provisioned host that does not fail — it quietly creates a *second* set
     * of admin accounts at @example.com addresses with generated passwords,
     * alongside the real ones. Loud beats silent.
     */
    private function assertEnvironmentIsReadable(): void
    {
        if (! app()->configurationIsCached()) {
            return;
        }

        throw new RuntimeException(
            'Configuration is cached, so .env is not being read and the SEED_* '
            .'credentials would be ignored. Run `php artisan config:clear` '
            .'first, then re-cache with `php artisan optimize` afterwards.',
        );
    }
}
