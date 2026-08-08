<?php

declare(strict_types=1);

use App\Services\Localization\LocaleManager;

beforeEach(function (): void {
    $this->locales = app(LocaleManager::class);
});

it('treats Persian as the default locale served from the site root', function (): void {
    expect($this->locales->default())->toBe('fa')
        ->and($this->locales->prefix('fa'))->toBe('')
        ->and($this->locales->prefix('en'))->toBe('en');
});

it('reports direction per locale', function (): void {
    expect($this->locales->direction('fa'))->toBe('rtl')
        ->and($this->locales->direction('en'))->toBe('ltr')
        ->and($this->locales->isRtl('fa'))->toBeTrue()
        ->and($this->locales->isRtl('en'))->toBeFalse();
});

it('exposes BCP 47 tags for hreflang rather than internal locale keys', function (): void {
    expect($this->locales->hreflang('fa'))->toBe('fa-IR')
        ->and($this->locales->hreflang('en'))->toBe('en');
});

it('builds localised paths', function (): void {
    expect($this->locales->url('/products', 'fa'))->toBe(url('/products'))
        ->and($this->locales->url('/products', 'en'))->toBe(url('/en/products'))
        ->and($this->locales->url('/', 'fa'))->toBe(url('/'))
        ->and($this->locales->url('/', 'en'))->toBe(url('/en'));
});

it('derives the locale from a request path', function (): void {
    expect($this->locales->fromPath('products'))->toBe('fa')
        ->and($this->locales->fromPath('en/products'))->toBe('en')
        ->and($this->locales->fromPath('/'))->toBe('fa')
        ->and($this->locales->fromPath('en'))->toBe('en');
});

it('does not mistake a path segment that merely starts with a prefix', function (): void {
    // "enclosures" must not be read as the "en" locale.
    expect($this->locales->fromPath('enclosures'))->toBe('fa');
});

describe('alternate URLs', function (): void {
    it('keeps the visitor on the same page when switching language', function (): void {
        $this->get('/en/design-system');

        expect($this->locales->alternateUrl('fa'))->toBe(url('/design-system'))
            ->and($this->locales->alternateUrl('en'))->toBe(url('/en/design-system'));
    });

    it('adds a prefix when leaving the default locale', function (): void {
        $this->get('/design-system');

        expect($this->locales->alternateUrl('en'))->toBe(url('/en/design-system'));
    });

    it('preserves the query string so filters survive a language switch', function (): void {
        $this->get('/design-system?surface=high-gloss&thickness=18');

        expect($this->locales->alternateUrl('en'))
            ->toBe(url('/en/design-system').'?surface=high-gloss&thickness=18');
    });

    it('lists every locale as an alternate', function (): void {
        $this->get('/design-system');

        expect($this->locales->alternates())->toEqual([
            'fa' => url('/design-system'),
            'en' => url('/en/design-system'),
        ]);
    });
});
