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

        // Kept in the session rather than re-read from the user on each render,
        // so a refresh does not silently rotate the secret the user is midway
        // through scanning.
        $secret = $request->session()->get('two_factor.pending_secret');

        if (! is_string($secret) || $secret === '') {
            $secret = $twoFactor->generateSecret($user);
            $request->session()->put('two_factor.pending_secret', $secret);
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

        $request->session()->forget('two_factor.pending_secret');

        // Enrolling counts as passing the challenge for this session.
        $request->session()->put(RequireTwoFactor::SESSION_KEY, time());

        // Shown exactly once; they are hashed-equivalent secrets from here on.
        return view('admin.auth.recovery-codes', ['recoveryCodes' => $recoveryCodes]);
    }
}
