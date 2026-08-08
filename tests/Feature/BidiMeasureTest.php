<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Blade;

/**
 * x-ui.measure is what stops the bidirectional algorithm from reordering latin
 * values inside Persian text. These assert the direction each part declares,
 * because getting it wrong renders "kg/m³ 740" or "5678 1234 21 98+".
 */
function measure(array $props): string
{
    $attributes = collect($props)
        ->map(fn ($value, $key): string => sprintf('%s="%s"', $key, e((string) $value)))
        ->implode(' ');

    return Blade::render("<x-ui.measure {$attributes} />");
}

it('resolves direction from the content by default', function (): void {
    // A Persian unit inside the value must read right-to-left, so forcing LTR
    // would put "میلی‌متر" on the wrong side.
    $html = measure(['value' => '2800 × 1220 میلی‌متر']);

    expect($html)->toContain('dir="auto"')
        ->not->toContain('ltr-isolate');
});

it('forces LTR only when asked', function (): void {
    // A phone number is latin in every locale and renders as
    // "5678 1234 21 98+" without this.
    expect(measure(['value' => '+98 21 1234 5678', 'dir' => 'ltr']))
        ->toContain('ltr-isolate');
});

it('isolates the unit separately from the value', function (): void {
    // "°C" starts with a neutral character and is otherwise reordered into
    // "C°" even when the value around it sits correctly.
    $html = measure(['value' => '180', 'unit' => '°C']);

    expect(substr_count($html, 'bidi-isolate'))->toBeGreaterThanOrEqual(3);
});

it('applies tabular figures so values align in a column', function (): void {
    expect(measure(['value' => '740']))->toContain('tabular');
});

it('renders no unit markup when none is given', function (): void {
    expect(measure(['value' => '740']))->not->toContain('&nbsp;');
});

it('escapes the value', function (): void {
    expect(measure(['value' => '<script>alert(1)</script>']))
        ->not->toContain('<script>');
});
