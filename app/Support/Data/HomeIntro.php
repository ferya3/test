<?php

declare(strict_types=1);

namespace App\Support\Data;

use App\Services\SettingsRepository;

/**
 * The editorial block below the homepage hero.
 *
 * The body is stored as one settings value and shown as several paragraphs, so
 * something has to split it. That something is here rather than in the Blade
 * template: a view should render a list of paragraphs, not decide what counts
 * as a paragraph.
 */
final readonly class HomeIntro
{
    /**
     * @param  list<string>  $paragraphs
     * @param  list<array{label: string, value: string}>  $facts
     */
    private function __construct(
        public ?string $overline,
        public ?string $heading,
        public array $paragraphs,
        public array $facts = [],
    ) {}

    /**
     * @param  list<array{label: string, value: string}>  $facts
     */
    public static function fromSettings(SettingsRepository $settings, array $facts = []): self
    {
        return new self(
            overline: $settings->translated('home_intro_overline'),
            heading: $settings->translated('home_intro_heading'),
            paragraphs: self::paragraphs($settings->translated('home_intro_body')),
            facts: $facts,
        );
    }

    /**
     * Nothing to show when an editor has cleared the fields — the section is
     * then skipped entirely rather than rendering an empty band.
     */
    public function isEmpty(): bool
    {
        return $this->heading === null && $this->paragraphs === [];
    }

    /**
     * Blank lines separate paragraphs, which is how people already write in a
     * textarea. \R matches every line ending, so a value pasted from Windows
     * does not silently become one long paragraph.
     *
     * @return list<string>
     */
    private static function paragraphs(?string $body): array
    {
        if ($body === null || trim($body) === '') {
            return [];
        }

        $parts = preg_split('/\R{2,}/u', trim($body)) ?: [];

        return array_values(array_filter(
            array_map(static fn (string $part): string => trim($part), $parts),
            static fn (string $part): bool => $part !== '',
        ));
    }
}
