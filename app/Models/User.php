<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Enums\RoleName;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Spatie\Permission\Traits\HasRoles;

/**
 * @property string $name
 * @property string $email
 * @property bool $is_active
 * @property string|null $two_factor_secret
 * @property array<int, string>|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 */
#[Fillable(['name', 'email', 'password', 'is_active'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory;

    use HasRoles;
    use Notifiable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function uploadedMedia(): HasMany
    {
        return $this->hasMany(Media::class, 'uploaded_by');
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class, 'author_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function isSuperAdmin(): bool
    {
        return $this->hasRole(RoleName::SuperAdmin->value);
    }

    /**
     * Whether this account may reach the admin panel at all.
     */
    public function canAccessAdminPanel(): bool
    {
        return $this->is_active && $this->hasAnyRole(RoleName::values());
    }

    public function hasEnabledTwoFactor(): bool
    {
        return $this->two_factor_secret !== null && $this->two_factor_confirmed_at !== null;
    }

    /**
     * Privileged roles must complete TOTP before the panel unlocks.
     */
    public function requiresTwoFactor(): bool
    {
        $required = array_map(
            static fn (RoleName $role): string => $role->value,
            RoleName::requiringTwoFactor(),
        );

        return $this->hasAnyRole($required);
    }

    /**
     * Consume a one-time recovery code. Returns false when the code is unknown,
     * so the caller can treat it as a failed authentication attempt.
     */
    public function useRecoveryCode(string $code): bool
    {
        $codes = $this->two_factor_recovery_codes ?? [];

        $remaining = array_values(array_filter(
            $codes,
            static fn (string $stored): bool => ! hash_equals($stored, $code),
        ));

        if (count($remaining) === count($codes)) {
            return false;
        }

        $this->forceFill(['two_factor_recovery_codes' => $remaining])->save();

        return true;
    }

    /**
     * Decrypted TOTP secret, or null when 2FA has not been set up.
     *
     * The `encrypted` cast already handles this; this accessor exists so callers
     * reading the secret do so through one deliberate, greppable entry point.
     */
    public function twoFactorSecret(): ?string
    {
        return $this->two_factor_secret;
    }

    public function recordLogin(?string $ipAddress): void
    {
        $this->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $ipAddress,
        ])->saveQuietly();
    }

    /**
     * Recovery codes are generated here so the format lives with the model that
     * validates them.
     *
     * @return list<string>
     */
    public static function generateRecoveryCodes(int $count = 8): array
    {
        return array_map(
            static fn (): string => strtoupper(bin2hex(random_bytes(5))),
            range(1, $count),
        );
    }
}
