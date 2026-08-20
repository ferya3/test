<?php

declare(strict_types=1);
use Illuminate\Routing\RouteCollection;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Vite;

it('renders the Persian reference page right to left', function (): void {
    $this->get('/design-system')
        ->assertOk()
        ->assertSee('<html lang="fa" dir="rtl"', escape: false);
});

it('renders the English reference page left to right', function (): void {
    $this->get('/en/design-system')
        ->assertOk()
        ->assertSee('<html lang="en" dir="ltr"', escape: false);
});

it('preloads only the active locale font', function (): void {
    // Preloading both faces would waste ~46KB of the critical path per page.
    $this->get('/design-system')
        ->assertSee('vazirmatn-arabic.woff2', escape: false)
        ->assertDontSee('inter-latin.woff2', escape: false);

    $this->get('/en/design-system')
        ->assertSee('inter-latin.woff2', escape: false)
        ->assertDontSee('vazirmatn-arabic.woff2', escape: false);
});

it('puts a skip link first in the document', function (): void {
    $html = $this->get('/design-system')->getContent();

    $skipPosition = strpos($html, 'href="#main"');
    $headerPosition = strpos($html, '<header');

    expect($skipPosition)->not->toBeFalse()
        ->and($skipPosition)->toBeLessThan($headerPosition);
});

it('applies a content security policy nonce to script and style tags', function (): void {
    $html = $this->get('/design-system')->getContent();

    preg_match_all('/nonce="([A-Za-z0-9+\/=]+)"/', $html, $matches);

    // One nonce value, reused across the inline theme script and the Vite tags.
    expect($matches[1])->not->toBeEmpty()
        ->and(array_unique($matches[1]))->toHaveCount(1);
});

it('generates an unpredictable nonce on each boot', function (): void {
    // A single test process reuses one application instance, so two requests
    // share a nonce here. Under php-fpm each request boots the app afresh; what
    // is verified is that the generator is random rather than fixed.
    $first = Vite::useCspNonce();
    $second = Vite::useCspNonce();

    expect($first)->not->toBe($second)
        ->and(strlen($first))->toBeGreaterThanOrEqual(32);
});

describe('form control accessibility', function (): void {
    it('describes a valid field with its hint', function (): void {
        $html = $this->get('/design-system')->getContent();

        expect($html)->toContain('aria-describedby="demo_phone-hint"')
            ->toContain('id="demo_phone-hint"');
    });

    it('describes an invalid field with its error and marks it invalid', function (): void {
        $html = $this->get('/design-system')->getContent();

        expect($html)->toContain('aria-describedby="demo_email-error"')
            ->toContain('aria-invalid="true"')
            ->toContain('id="demo_email-error"');
    });

    it('announces validation errors with role=alert', function (): void {
        expect($this->get('/design-system')->getContent())
            ->toContain('role="alert"');
    });
});

describe('bidirectional text', function (): void {
    it('isolates latin values so they are not reordered in Persian text', function (): void {
        $html = $this->get('/design-system')->getContent();

        // "740 kg/m³" would otherwise render as "kg/m³ 740".
        expect($html)->toContain('bidi-isolate');
    });

    it('forces LTR for values that are latin in every locale', function (): void {
        // The factory phone number renders as "5678 1234 21 98+" without this.
        expect($this->get('/design-system')->getContent())
            ->toContain('ltr-isolate');
    });
});

it('does not register the reference page in production', function (): void {
    // Routes are registered at boot, so flipping the environment afterwards
    // cannot affect an already-built collection. Re-evaluating the routes file
    // under a production environment exercises the guard directly.
    expect(Route::has('fa.design-system'))->toBeTrue()
        ->and(Route::has('en.design-system'))->toBeTrue();

    app()->detectEnvironment(fn (): string => 'production');
    Route::setRoutes(new RouteCollection);
    require base_path('routes/web.php');

    expect(Route::has('fa.design-system'))->toBeFalse()
        ->and(Route::has('en.design-system'))->toBeFalse();
});
