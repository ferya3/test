<?php

declare(strict_types=1);

it('sets the static security headers on an HTML response', function (): void {
    $this->get('/')
        ->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        ->assertHeader('Cross-Origin-Opener-Policy', 'same-origin')
        ->assertHeader('X-Permitted-Cross-Domain-Policies', 'none');
});

it('sets nosniff on responses that are not HTML', function (): void {
    // The header matters most here: these bytes are served from our origin and
    // a browser that sniffs one as HTML would render it as same-origin content.
    $this->get('/sitemap.xml')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
    $this->get('/robots.txt')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
});

it('restricts the powerful browser features the site never uses', function (): void {
    $policy = $this->get('/')->assertOk()->headers->get('Permissions-Policy');

    expect($policy)->toContain('camera=()')
        ->toContain('microphone=()')
        ->toContain('geolocation=()');
});

describe('HSTS', function (): void {
    it('is sent over TLS', function (): void {
        $this->get('https://localhost/')
            ->assertOk()
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    });

    it('is withheld over plain HTTP', function (): void {
        // A browser ignores it there anyway, and sending it would claim an
        // enforcement a plain-HTTP install does not have.
        $this->get('http://localhost/')->assertOk()->assertHeaderMissing('Strict-Transport-Security');
    });

    it('can be turned off entirely', function (): void {
        config()->set('security.hsts.enabled', false);

        $this->get('https://localhost/')->assertOk()->assertHeaderMissing('Strict-Transport-Security');
    });
});

describe('the content security policy', function (): void {
    it('locks down the directives that stop injection', function (): void {
        $csp = $this->get('/')->assertOk()->headers->get('Content-Security-Policy');

        expect($csp)->toContain("default-src 'self'")
            ->toContain("object-src 'none'")
            ->toContain("base-uri 'self'")
            ->toContain("form-action 'self'")
            ->toContain("frame-ancestors 'self'");
    });

    it('carries a nonce that every script tag in the document also carries', function (): void {
        // If these ever diverge the browser blocks every script on the page,
        // so this is the assertion that keeps the policy shippable.
        $response = $this->get('/')->assertOk();

        preg_match('/nonce-([A-Za-z0-9]+)/', (string) $response->headers->get('Content-Security-Policy'), $header);
        preg_match_all('/<script[^>]*\bnonce="([A-Za-z0-9]+)"/', $response->getContent(), $document);

        expect($header[1] ?? null)->not->toBeNull()
            ->and($document[1])->not->toBeEmpty()
            ->and(array_unique($document[1]))->toBe([$header[1]]);
    });

    it('uses a nonce long enough not to be guessed', function (): void {
        // Freshness per request is not asserted here: the nonce is generated in
        // AppServiceProvider::boot(), which runs once per application lifecycle
        // — once per request under PHP-FPM, but once per *test* in this
        // harness, where several get() calls share one booted application. What
        // is worth pinning is the entropy, since a short or predictable nonce
        // would let an injected script guess its way past the policy.
        preg_match(
            '/nonce-([A-Za-z0-9]+)/',
            (string) $this->get('/')->headers->get('Content-Security-Policy'),
            $matches,
        );

        expect(strlen($matches[1] ?? ''))->toBeGreaterThanOrEqual(32);
    });

    it('leaves no script tag in the document without a nonce', function (): void {
        // A script without the nonce would be blocked in the browser but pass
        // silently here, so the count is asserted rather than the presence.
        $html = $this->get('/')->assertOk()->getContent();

        $total = preg_match_all('/<script\b/', $html);
        $nonced = preg_match_all('/<script[^>]*\bnonce="/', $html);

        expect($nonced)->toBe($total);
    });

    it('upgrades passive mixed content only once the connection is TLS', function (): void {
        expect($this->get('https://localhost/')->headers->get('Content-Security-Policy'))
            ->toContain('upgrade-insecure-requests');

        expect($this->get('http://localhost/')->headers->get('Content-Security-Policy'))
            ->not->toContain('upgrade-insecure-requests');
    });

    it('is not attached to responses that are not HTML', function (): void {
        $this->get('/sitemap.xml')->assertOk()->assertHeaderMissing('Content-Security-Policy');
    });

    it('switches to report-only without blocking anything', function (): void {
        config()->set('security.csp.report_only', true);

        $this->get('/')
            ->assertOk()
            ->assertHeaderMissing('Content-Security-Policy')
            ->assertHeader('Content-Security-Policy-Report-Only');
    });

    it('can be disabled', function (): void {
        config()->set('security.csp.enabled', false);

        $this->get('/')->assertOk()->assertHeaderMissing('Content-Security-Policy');
    });
});

describe('password hashing', function (): void {
    it('ships a cost of 12 by default', function (): void {
        // Asserted against the shipped config rather than the running value:
        // phpunit.xml sets BCRYPT_ROUNDS=4 so the suite is not spending most of
        // its time hashing, which is the right call for tests and the wrong one
        // to let leak into what production is documented to use.
        expect(file_get_contents(base_path('config/hashing.php')))
            ->toContain("'rounds' => env('BCRYPT_ROUNDS', 12)");

        expect(file_get_contents(base_path('.env.example')))->toContain('BCRYPT_ROUNDS=12');
    });

    it('hashes with bcrypt and refuses a hash from another algorithm', function (): void {
        ['algo' => $algo] = password_get_info(bcrypt('correct horse battery staple'));

        expect($algo)->toBe(PASSWORD_BCRYPT)
            ->and(config('hashing.driver'))->toBe('bcrypt')
            // Without verify, a stored argon2 hash would be waved through by
            // the bcrypt verifier.
            ->and(config('hashing.bcrypt.verify'))->toBeTrue();
    });

    it('applies whatever cost is configured', function (): void {
        ['options' => $options] = password_get_info(bcrypt('correct horse battery staple'));

        expect($options['cost'])->toBe((int) config('hashing.bcrypt.rounds'));
    });
});
