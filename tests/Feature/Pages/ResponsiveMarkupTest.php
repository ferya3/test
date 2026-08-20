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
    '/categories/hpl-cabinet-panel',
    '/en/categories/hpl-cabinet-panel',
    '/contact',
    '/categories',
]);

it('detects the conflict it is meant to catch', function (): void {
    // Proves the check above is not vacuously passing.
    expect(conflictingDisplayClasses('<div class="hidden sm:flex flex items-center"></div>'))
        ->toHaveCount(1);
});

/*
|--------------------------------------------------------------------------
| Sizing conflicts
|--------------------------------------------------------------------------
|
| The same hazard as above, one property along. `size-full` and `h-auto` on one
| element are both height declarations, so which applies is decided by their
| order in the compiled stylesheet — and Tailwind emits `h-auto` last, so it
| wins wherever both appear.
|
| That is how the hero image stopped covering its section: x-media.picture
| always prepended `h-auto w-full`, the hero added `size-full object-cover` on
| top, and the image quietly took its intrinsic height and left the rest of the
| hero empty. Nothing looked wrong in the markup.
|
*/

/**
 * @return list<string>
 */
function conflictingSizeClasses(string $html): array
{
    $conflicts = [];

    preg_match_all('/class="([^"]*)"/', $html, $matches);

    foreach ($matches[1] as $classList) {
        $classes = preg_split('/\s+/', trim($classList)) ?: [];

        $setsFullHeight = array_intersect($classes, ['size-full', 'h-full']);
        $setsAutoHeight = in_array('h-auto', $classes, true);

        if ($setsFullHeight !== [] && $setsAutoHeight) {
            $conflicts[] = $classList;
        }
    }

    return $conflicts;
}

it('never puts h-auto and a full-height utility on one element', function (string $path): void {
    expect(conflictingSizeClasses($this->get($path)->assertOk()->getContent()))->toBe([]);
})->with(['/', '/en', '/categories/hpl-cabinet-panel', '/categories', '/contact']);

it('detects the sizing conflict it is meant to catch', function (): void {
    expect(conflictingSizeClasses('<img class="block h-auto w-full size-full object-cover">'))
        ->toHaveCount(1);
});

/*
|--------------------------------------------------------------------------
| Mobile first
|--------------------------------------------------------------------------
*/

it('styles for the small screen first and layers larger ones on top', function (): void {
    /*
     * Tailwind's `sm:`/`md:`/`lg:` are min-width: the unprefixed classes are the
     * phone, and each prefix adds to it going up. `max-md:` and friends invert
     * that — the base becomes the desktop and the phone becomes the exception —
     * and mixing the two conventions in one codebase is what makes a responsive
     * bug take an afternoon instead of a minute.
     *
     * Asserted against the templates rather than the rendered page, because a
     * page only exercises the branches its own data reaches.
     */
    $offenders = [];

    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator(resource_path('views'), FilesystemIterator::SKIP_DOTS),
    );

    foreach ($files as $file) {
        if (! str_ends_with((string) $file, '.blade.php')) {
            continue;
        }

        $contents = (string) file_get_contents((string) $file);

        if (preg_match_all('/\bmax-(sm|md|lg|xl|2xl):/', $contents, $matches)) {
            $offenders[] = str_replace(resource_path('views').'/', '', (string) $file)
                .': '.implode(', ', array_unique($matches[0]));
        }
    }

    expect($offenders)->toBe([]);
});
