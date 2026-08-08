<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum RoleName: string
{
    case SuperAdmin = 'super-admin';
    case Admin = 'admin';
    case Editor = 'editor';
    case ProductManager = 'product-manager';

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => __('roles.super_admin'),
            self::Admin => __('roles.admin'),
            self::Editor => __('roles.editor'),
            self::ProductManager => __('roles.product_manager'),
        };
    }

    /**
     * Roles that must clear TOTP two-factor authentication before reaching
     * the admin panel.
     *
     * @return list<self>
     */
    public static function requiringTwoFactor(): array
    {
        return [self::SuperAdmin, self::Admin];
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
