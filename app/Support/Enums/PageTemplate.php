<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum PageTemplate: string implements HasLabel
{
    case Default = 'default';
    case About = 'about';
    case Factory = 'factory';
    case Process = 'process';
    case Quality = 'quality';

    public function label(): string
    {
        return __("enums.page_template.{$this->value}");
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
