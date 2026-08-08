<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\Auth\LoginController;
use App\Http\Controllers\Admin\Auth\TwoFactorChallengeController;
use App\Http\Controllers\Admin\Auth\TwoFactorSetupController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\Resources\ApplicationController;
use App\Http\Controllers\Admin\Resources\ArticleCategoryController;
use App\Http\Controllers\Admin\Resources\ArticleController;
use App\Http\Controllers\Admin\Resources\CatalogController;
use App\Http\Controllers\Admin\Resources\CategoryController;
use App\Http\Controllers\Admin\Resources\CertificateController;
use App\Http\Controllers\Admin\Resources\ColorController;
use App\Http\Controllers\Admin\Resources\DecorController;
use App\Http\Controllers\Admin\Resources\LeadController;
use App\Http\Controllers\Admin\Resources\MaterialController;
use App\Http\Controllers\Admin\Resources\MediaController;
use App\Http\Controllers\Admin\Resources\PageController;
use App\Http\Controllers\Admin\Resources\ProductController;
use App\Http\Controllers\Admin\Resources\ProjectController;
use App\Http\Controllers\Admin\Resources\RepresentativeController;
use App\Http\Controllers\Admin\Resources\SettingController;
use App\Http\Controllers\Admin\Resources\SurfaceController;
use App\Http\Controllers\Admin\Resources\ThicknessController;
use App\Http\Controllers\Admin\Resources\UserController;
use App\Http\Middleware\EnsureCanAccessAdmin;
use App\Http\Middleware\RequireTwoFactor;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin routes
|--------------------------------------------------------------------------
|
| Mounted under /admin with no locale prefix: the panel is a single-language
| back office, not part of the public bilingual site.
|
| Three concentric layers of protection:
|   guest            the sign-in form
|   auth + admin     authenticated, active, holding an admin role
|   + two-factor     privileged roles must additionally clear TOTP
|
*/

Route::middleware('guest')->group(function (): void {
    Route::get('/login', [LoginController::class, 'create'])->name('login');

    // Throttled per email+IP inside the Form Request; this is a second, coarser
    // ceiling so a distributed attempt still meets a wall.
    Route::post('/login', [LoginController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('login.store');
});

Route::post('/logout', [LoginController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

/*
 * Authenticated but not yet past the two-factor gate. Enrolment and the
 * challenge must live outside the gate, or there would be no way through it.
 */
Route::middleware(['auth', EnsureCanAccessAdmin::class])->group(function (): void {
    Route::get('/two-factor/setup', [TwoFactorSetupController::class, 'create'])
        ->name('two-factor.setup');
    Route::post('/two-factor/setup', [TwoFactorSetupController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('two-factor.setup.store');

    Route::get('/two-factor/challenge', [TwoFactorChallengeController::class, 'create'])
        ->name('two-factor.challenge');
    Route::post('/two-factor/challenge', [TwoFactorChallengeController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('two-factor.challenge.store');
});

Route::middleware(['auth', EnsureCanAccessAdmin::class, RequireTwoFactor::class])->group(function (): void {
    Route::get('/', DashboardController::class)->name('dashboard');

    /*
     * Resources sharing the generic CRUD controller. Each is authorised by its
     * own policy, which maps onto the permission matrix — so an Editor reaching
     * /admin/products gets a 403 from the policy rather than from a hand-rolled
     * check that could be forgotten.
     */
    $crud = [
        'products' => ProductController::class,
        'categories' => CategoryController::class,
        'colors' => ColorController::class,
        'decors' => DecorController::class,
        'materials' => MaterialController::class,
        'surfaces' => SurfaceController::class,
        'applications' => ApplicationController::class,
        'thicknesses' => ThicknessController::class,
        'pages' => PageController::class,
        'articles' => ArticleController::class,
        'article-categories' => ArticleCategoryController::class,
        'projects' => ProjectController::class,
        'certificates' => CertificateController::class,
        'catalogs' => CatalogController::class,
        'representatives' => RepresentativeController::class,
    ];

    foreach ($crud as $slug => $controller) {
        Route::get("/{$slug}", [$controller, 'index'])->name("{$slug}.index");
        Route::get("/{$slug}/create", [$controller, 'create'])->name("{$slug}.create");
        Route::post("/{$slug}", [$controller, 'store'])->name("{$slug}.store");
        Route::get("/{$slug}/{id}/edit", [$controller, 'edit'])->name("{$slug}.edit");
        Route::put("/{$slug}/{id}", [$controller, 'update'])->name("{$slug}.update");
        Route::delete("/{$slug}/{id}", [$controller, 'destroy'])->name("{$slug}.destroy");
    }

    // Media library
    Route::get('/media', [MediaController::class, 'index'])->name('media.index');
    Route::post('/media', [MediaController::class, 'store'])->name('media.store');
    Route::put('/media/{medium}', [MediaController::class, 'update'])->name('media.update');
    Route::delete('/media/{medium}', [MediaController::class, 'destroy'])->name('media.destroy');

    // Lead triage
    Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
    Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
    Route::put('/leads/{lead}', [LeadController::class, 'update'])->name('leads.update');
    Route::delete('/leads/{lead}', [LeadController::class, 'destroy'])->name('leads.destroy');

    Route::get('/catalog-requests', [LeadController::class, 'catalogRequests'])
        ->name('catalog-requests.index');
    Route::put('/catalog-requests/{catalogRequest}', [LeadController::class, 'updateCatalogRequest'])
        ->name('catalog-requests.update');

    // Administration
    Route::get('/users', [UserController::class, 'index'])->name('users.index');
    Route::get('/users/create', [UserController::class, 'create'])->name('users.create');
    Route::post('/users', [UserController::class, 'store'])->name('users.store');
    Route::get('/users/{user}/edit', [UserController::class, 'edit'])->name('users.edit');
    Route::put('/users/{user}', [UserController::class, 'update'])->name('users.update');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->name('users.destroy');
    Route::post('/users/{user}/reset-two-factor', [UserController::class, 'resetTwoFactor'])
        ->name('users.reset-two-factor');

    Route::get('/settings', [SettingController::class, 'index'])->name('settings.index');
    Route::put('/settings', [SettingController::class, 'update'])->name('settings.update');
});
