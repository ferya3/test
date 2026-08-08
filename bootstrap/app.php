<?php

declare(strict_types=1);

use App\Http\Middleware\SetLocale;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            // Mounted separately so the panel keeps its own prefix and name
            // space, and never inherits the public site's locale routing.
            Route::middleware('web')
                ->prefix('admin')
                ->name('admin.')
                ->group(base_path('routes/admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Runs on every web request: the active locale is derived from the URL
        // and must be set before any controller or view resolves a translation.
        $middleware->web(append: [
            SetLocale::class,
        ]);

        // The framework's `auth` middleware redirects guests to a route named
        // "login". The panel's is "admin.login", and there is no public login
        // at all, so without this an unauthenticated request to /admin fails
        // with RouteNotFoundException instead of redirecting.
        $middleware->redirectGuestsTo(fn (): string => route('admin.login'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
