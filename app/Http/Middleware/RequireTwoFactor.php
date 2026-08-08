<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Holds privileged roles at the two-factor gate.
 *
 * Two distinct states are handled: an account that has never enrolled is sent
 * to set-up, and an enrolled account that has not yet answered the challenge in
 * this session is sent to the challenge. Both are enforced on every request, so
 * a deep link cannot skip the gate.
 */
class RequireTwoFactor
{
    public const string SESSION_KEY = 'auth.two_factor_confirmed_at';

    /**
     * How long a passed challenge lasts before it is asked for again.
     */
    private const int CONFIRMATION_TTL = 8 * 3600;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null || ! $user->requiresTwoFactor()) {
            return $next($request);
        }

        if (! $user->hasEnabledTwoFactor()) {
            return redirect()->route('admin.two-factor.setup');
        }

        if (! $this->recentlyConfirmed($request)) {
            return redirect()->route('admin.two-factor.challenge');
        }

        return $next($request);
    }

    private function recentlyConfirmed(Request $request): bool
    {
        $confirmedAt = $request->session()->get(self::SESSION_KEY);

        return is_int($confirmedAt) && (time() - $confirmedAt) < self::CONFIRMATION_TTL;
    }
}
