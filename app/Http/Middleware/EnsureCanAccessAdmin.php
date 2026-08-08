<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Only active accounts holding one of the admin roles reach the panel.
 *
 * A deactivated account is logged out on its next request rather than merely
 * being refused, so revoking access takes effect immediately instead of lasting
 * until the session happens to expire.
 */
class EnsureCanAccessAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            return redirect()->guest(route('admin.login'));
        }

        if (! $user->canAccessAdminPanel()) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            // 404 rather than 403: an authenticated non-admin learns nothing
            // about what exists behind this prefix.
            throw new NotFoundHttpException;
        }

        return $next($request);
    }
}
