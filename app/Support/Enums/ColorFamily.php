<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum ColorFamily: string
{
    case Neutral = 'neutral';
    case Wood = 'wood';
    case Solid = 'solid';
    case Metallic = 'metallic';
    case Stone = 'stone';

    public function label(): string
    {
        return __("enums.color_family.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
