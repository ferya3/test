<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * Emits the Content-Security-Policy header, with the per-request nonce that
 * AppServiceProvider already generates through Vite::useCspNonce().
 *
 * That nonce is what makes the policy worth having: the @vite tags and the two
 * inline theme-bootstrap scripts carry it, so any *other* script — one injected
 * through a hole we have not found yet — has no nonce and does not execute.
 *
 * HTML only. A CSP on a sitemap or a streamed PDF governs nothing, and adding
 * it to a download response is bytes spent to no effect.
 */
class ContentSecurityPolicy
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! config('security.csp.enabled', true) || ! $this->isHtml($response)) {
            return $response;
        }

        $header = config('security.csp.report_only', false)
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';

        // Never clobber a policy a controller set deliberately.
        if ($response->headers->has($header)) {
            return $response;
        }

        $response->headers->set($header, $this->policy());

        return $response;
    }

    private function policy(): string
    {
        /** @var array<string, list<string>> $directives */
        $directives = config('security.csp.directives', []);
        $nonce = Vite::cspNonce();

        $parts = [];

        foreach ($directives as $directive => $sources) {
            $resolved = array_map(
                static fn (string $source): string => str_replace('{nonce}', (string) $nonce, $source),
                $sources,
            );

            $parts[] = $directive.' '.implode(' ', $resolved);
        }

        $reportUri = config('security.csp.report_uri');

        if (is_string($reportUri) && $reportUri !== '') {
            $parts[] = 'report-uri '.$reportUri;
        }

        // Upgrades passive mixed content once the site is actually on TLS.
        // Emitting it on a plain-HTTP install would break every asset.
        if (request()->secure()) {
            $parts[] = 'upgrade-insecure-requests';
        }

        return implode('; ', $parts);
    }

    private function isHtml(Response $response): bool
    {
        return str_contains((string) $response->headers->get('Content-Type'), 'text/html');
    }
}
