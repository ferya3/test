<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum DecorFamily: string implements HasLabel
{
    case Wood = 'wood';
    case Stone = 'stone';
    case Fabric = 'fabric';
    case Solid = 'solid';
    case Fantasy = 'fantasy';

    public function label(): string
    {
        return __("enums.decor_family.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
