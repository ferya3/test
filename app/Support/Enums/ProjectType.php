<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum ProjectType: string implements HasLabel
{
    case Residential = 'residential';
    case Commercial = 'commercial';
    case Hospitality = 'hospitality';
    case Office = 'office';

    public function label(): string
    {
        return __("enums.project_type.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
