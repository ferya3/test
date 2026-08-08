<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web routes
|--------------------------------------------------------------------------
|
| Public page routes arrive in stage 3. Each route body is registered once and
| mounted twice — at the root for Persian and under /en for English — so there
| is a single source of truth per page.
|
*/

Route::get('/', fn () => view('welcome'));

/*
 * Design system reference. Never registered in production: it is a development
 * and review surface, not part of the site.
 */
if (! app()->isProduction()) {
    foreach (['', 'en'] as $prefix) {
        Route::get(trim("{$prefix}/design-system", '/'), fn () => view('pages.design-system'))
            ->name($prefix === '' ? 'design-system' : 'design-system.en');
    }
}
