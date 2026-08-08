<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use App\Support\Enums\RoleName;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake('fa_IR')->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'is_active' => true,

            // Declared explicitly rather than left to the column defaults, so a
            // factory-built instance carries the same attributes as the row it
            // creates. Without them, preventAccessingMissingAttributes throws
            // the first time anything reads $user->two_factor_secret.
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
            'last_login_at' => null,
            'last_login_ip' => null,

            'remember_token' => Str::random(10),
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes): array => [
            'email_verified_at' => null,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => [
            'is_active' => false,
        ]);
    }

    /**
     * A user with 2FA enrolled and confirmed.
     */
    public function withTwoFactor(string $secret = 'ABCDEFGHIJKLMNOP'): static
    {
        return $this->state(fn (array $attributes): array => [
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => User::generateRecoveryCodes(),
            'two_factor_confirmed_at' => now(),
        ]);
    }

    public function withRole(RoleName $role): static
    {
        return $this->afterCreating(function (User $user) use ($role): void {
            $user->assignRole($role->value);
        });
    }

    public function superAdmin(): static
    {
        return $this->withRole(RoleName::SuperAdmin)->withTwoFactor();
    }

    public function admin(): static
    {
        return $this->withRole(RoleName::Admin)->withTwoFactor();
    }

    public function editor(): static
    {
        return $this->withRole(RoleName::Editor);
    }

    public function productManager(): static
    {
        return $this->withRole(RoleName::ProductManager);
    }
}
