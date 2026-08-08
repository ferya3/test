<?php

declare(strict_types=1);

namespace App\Support\Enums;

/**
 * Triage state shared by contact requests and catalog requests.
 */
enum LeadStatus: string implements HasLabel
{
    case New = 'new';
    case InProgress = 'in_progress';
    case Contacted = 'contacted';
    case Closed = 'closed';

    public function label(): string
    {
        return __("enums.lead_status.{$this->value}");
    }

    public function isOpen(): bool
    {
        return $this !== self::Closed;
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
