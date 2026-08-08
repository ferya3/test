<?php

declare(strict_types=1);

use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\ProductSeeder;
use Database\Seeders\SettingSeeder;

/**
 * Guards against a Blade/Tailwind hazard that is invisible in review.
 *
 * $attributes->class() *merges* the caller's classes with the component's own,
 * so passing `class="hidden sm:flex"` to a component that already sets `flex`
 * emits both. Which one wins then depends on their order in the compiled
 * stylesheet rather than on the markup — that shipped a header 9px wider than
 * the viewport on English mobile pages, while Persian looked fine.
 *
 * Visibility therefore belongs on a wrapper element, never on a component that
 * declares its own display.
 */
beforeEach(function (): void {
    $this->seed([SettingSeeder::class, AttributeSeeder::class, CategorySeeder::class, ProductSeeder::class]);
});

/**
 * @return list<string>
 */
function conflictingDisplayClasses(string $html): array
{
    $conflicts = [];

    preg_match_all('/class="([^"]*)"/', $html, $matches);

    foreach ($matches[1] as $classList) {
        $classes = preg_split('/\s+/', trim($classList)) ?: [];

        // `hidden` alongside an unconditional display utility on the same
        // element is always ambiguous.
        $hasHidden = in_array('hidden', $classes, true);
        $unconditionalDisplay = array_intersect(
            $classes,
            ['flex', 'inline-flex', 'block', 'inline-block', 'grid', 'inline-grid'],
        );

        if ($hasHidden && $unconditionalDisplay !== []) {
            $conflicts[] = $classList;
        }
    }

    return $conflicts;
}

it('never puts hidden and an unconditional display utility on one element', function (string $path): void {
    $html = $this->get($path)->assertOk()->getContent();

    expect(conflictingDisplayClasses($html))->toBe([]);
})->with([
    '/',
    '/en',
    '/products',
    '/en/products',
    '/contact',
    '/categories',
]);

it('detects the conflict it is meant to catch', function (): void {
    // Proves the check above is not vacuously passing.
    expect(conflictingDisplayClasses('<div class="hidden sm:flex flex items-center"></div>'))
        ->toHaveCount(1);
});
