<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Auth;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequireTwoFactor;
use App\Services\Auth\TwoFactorService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * TOTP enrolment.
 *
 * The secret is stored the moment it is generated but is not active until the
 * user echoes back a code from their authenticator — so a mis-scanned QR code
 * cannot lock someone out of their own account.
 */
class TwoFactorSetupController extends Controller
{
    public function create(Request $request, TwoFactorService $twoFactor): View|RedirectResponse
    {
        $user = $request->user();

        if ($user->hasEnabledTwoFactor()) {
            return redirect()->route('admin.dashboard');
        }

        /*
         * The user record is the source of truth for a pending secret.
         *
         * This used to live in the session, on the reasoning that re-reading it
         * per render would rotate it. That had it backwards: re-reading is what
         * keeps it stable, and the session only added a way to lose it. Whenever
         * the session did not carry over — a new sign-in, a Redis restart, a
         * cleared cookie, a second tab — the page generated a *new* secret and
         * overwrote the stored one, so the QR code the person had already
         * scanned no longer matched and every code they typed was rejected as
         * wrong, with nothing to explain why.
         *
         * `confirm()` verifies against this same column, so rendering it is the
         * only way the two can be guaranteed to agree. A genuinely fresh secret
         * is issued by resetting two-factor on the user, which nulls the column.
         */
        $secret = $user->two_factor_secret;

        if (! is_string($secret) || $secret === '') {
            $secret = $twoFactor->generateSecret($user);
        }

        return view('admin.auth.two-factor-setup', [
            'secret' => $secret,
            'qrCode' => $twoFactor->qrCodeSvg($user, $secret),
        ]);
    }

    public function store(Request $request, TwoFactorService $twoFactor): RedirectResponse|View
    {
        $request->validate(['code' => ['required', 'string']]);

        $user = $request->user();
        $recoveryCodes = $twoFactor->confirm($user, (string) $request->string('code'));

        if ($recoveryCodes === null) {
            throw ValidationException::withMessages(['code' => __('auth.two_factor.invalid')]);
        }

        // Enrolling counts as passing the challenge for this session.
        $request->session()->put(RequireTwoFactor::SESSION_KEY, time());

        // Shown exactly once; they are hashed-equivalent secrets from here on.
        return view('admin.auth.recovery-codes', ['recoveryCodes' => $recoveryCodes]);
    }
}
