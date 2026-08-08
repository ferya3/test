<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Applies the static security headers from config/security.php to every
 * response, plus HSTS on TLS connections.
 *
 * Deliberately not limited to HTML: `X-Content-Type-Options: nosniff` matters
 * most on the responses that are *not* HTML — a streamed PDF that a browser
 * decides to sniff as something else is exactly the case the header exists for.
 *
 * Existing headers are never overwritten, so a controller that sets its own
 * (a download choosing a stricter Referrer-Policy, say) keeps it.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        /** @var array<string, string> $headers */
        $headers = config('security.headers', []);

        foreach ($headers as $header => $value) {
            if (! $response->headers->has($header)) {
                $response->headers->set($header, $value);
            }
        }

        $this->applyStrictTransportSecurity($request, $response);

        return $response;
    }

    private function applyStrictTransportSecurity(Request $request, Response $response): void
    {
        // A browser ignores HSTS delivered over plain HTTP, and sending it
        // there would claim an enforcement this install does not have.
        if (! config('security.hsts.enabled', true) || ! $request->secure()) {
            return;
        }

        $directives = ['max-age='.(int) config('security.hsts.max_age', 31536000)];

        if (config('security.hsts.include_subdomains', true)) {
            $directives[] = 'includeSubDomains';
        }

        if (config('security.hsts.preload', false)) {
            $directives[] = 'preload';
        }

        $response->headers->set('Strict-Transport-Security', implode('; ', $directives));
    }
}
