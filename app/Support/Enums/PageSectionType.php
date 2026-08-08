<?php

declare(strict_types=1);

namespace App\Support\Enums;

enum PageSectionType: string
{
    case Text = 'text';
    case Step = 'step';
    case Stat = 'stat';
    case Feature = 'feature';
    case Quote = 'quote';
    case Gallery = 'gallery';
    case Cta = 'cta';
    case Timeline = 'timeline';

    public function label(): string
    {
        return __("enums.page_section_type.{$this->value}");
    }

    /**
     * The Blade component that renders this section type.
     */
    public function component(): string
    {
        return match ($this) {
            self::Text => 'content.prose-section',
            self::Step => 'content.step',
            self::Stat => 'content.stat-band',
            self::Feature => 'content.feature',
            self::Quote => 'content.quote',
            self::Gallery => 'media.gallery',
            self::Cta => 'content.cta-band',
            self::Timeline => 'content.timeline',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
