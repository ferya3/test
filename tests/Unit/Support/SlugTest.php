<?php

declare(strict_types=1);

use App\Support\Slug;

it('transliterates Persian text into a latin slug', function (): void {
    expect(Slug::make('پنل کابینت آشپزخانه'))->toBe('pnl-kabynt-ashpzkhanh');
});

it('keeps latin text intact', function (): void {
    expect(Slug::make('High Gloss Panel'))->toBe('high-gloss-panel');
});

it('handles mixed Persian and latin text', function (): void {
    expect(Slug::make('پنل High Gloss سفید'))->toBe('pnl-high-gloss-sfyd');
});

it('converts Persian digits to latin digits', function (): void {
    expect(Slug::make('ضخامت ۱۸ میلی‌متر'))->toBe('zkhamt-18-myly-mtr');
});

it('treats the zero-width non-joiner as a word separator', function (): void {
    // "می‌متر" contains a ZWNJ, which must not fuse the two words together.
    expect(Slug::make("می\u{200c}متر"))->toBe('my-mtr');
});

it('drops Arabic diacritics rather than transliterating them', function (): void {
    expect(Slug::make('مُحَمَّد'))->toBe('mhmd');
});

it('falls back when the source transliterates to nothing', function (): void {
    expect(Slug::make('!!!', 'product'))->toBe('product')
        ->and(Slug::make('', 'category'))->toBe('category');
});

it('normalises Arabic letter forms to their Persian equivalents', function (): void {
    // Arabic yeh/kaf must slug identically to Persian yeh/kaf.
    expect(Slug::make('كيف'))->toBe(Slug::make('کیف'));
});
