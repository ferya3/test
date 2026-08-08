<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequireTwoFactor;
use App\Services\Auth\TwoFactorService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TwoFactorChallengeController extends Controller
{
    public function create(Request $request): View|RedirectResponse
    {
        if (! $request->user()->hasEnabledTwoFactor()) {
            return redirect()->route('admin.two-factor.setup');
        }

        return view('admin.auth.two-factor-challenge');
    }

    public function store(Request $request, TwoFactorService $twoFactor): RedirectResponse
    {
        $request->validate([
            'code' => ['nullable', 'string'],
            'recovery_code' => ['nullable', 'string'],
        ]);

        $this->ensureIsNotRateLimited($request);

        $user = $request->user();
        $code = (string) $request->string('code');
        $recoveryCode = (string) $request->string('recovery_code');

        $passed = $recoveryCode !== ''
            ? $user->useRecoveryCode(strtoupper(trim($recoveryCode)))
            : $twoFactor->verify($user, $code);

        if (! $passed) {
            RateLimiter::hit($this->throttleKey($request));

            throw ValidationException::withMessages([
                'code' => __('auth.two_factor.invalid'),
            ]);
        }

        RateLimiter::clear($this->throttleKey($request));

        // Regenerated on passing the second factor as well: the session that
        // completes the challenge should not be the one an attacker fixed.
        $request->session()->regenerate();
        $request->session()->put(RequireTwoFactor::SESSION_KEY, time());

        return redirect()->intended(route('admin.dashboard'));
    }

    private function ensureIsNotRateLimited(Request $request): void
    {
        // Tighter than the password form: six digits is a small space, so an
        // unthrottled challenge is brute-forceable in minutes.
        if (! RateLimiter::tooManyAttempts($this->throttleKey($request), maxAttempts: 5)) {
            return;
        }

        throw ValidationException::withMessages([
            'code' => __('auth.throttle', [
                'seconds' => RateLimiter::availableIn($this->throttleKey($request)),
                'minutes' => (int) ceil(RateLimiter::availableIn($this->throttleKey($request)) / 60),
            ]),
        ]);
    }

    private function throttleKey(Request $request): string
    {
        return Str::transliterate('2fa|'.$request->user()->getKey().'|'.$request->ip());
    }
}
