<?php

declare(strict_types=1);

use App\Http\Controllers\Public\ArticleController;
use App\Http\Controllers\Public\CatalogController;
use App\Http\Controllers\Public\CategoryController;
use App\Http\Controllers\Public\CertificateController;
use App\Http\Controllers\Public\ColorDecorController;
use App\Http\Controllers\Public\CompareController;
use App\Http\Controllers\Public\ContactController;
use App\Http\Controllers\Public\HomeController;
use App\Http\Controllers\Public\PageController;
use App\Http\Controllers\Public\ProductController;
use App\Http\Controllers\Public\ProjectController;
use App\Http\Controllers\Public\RepresentativeController;
use App\Http\Controllers\Public\SearchController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web routes
|--------------------------------------------------------------------------
|
| Every page is registered once in $pages and mounted twice: at the site root
| for Persian and under /en for English. Names are scoped by locale
| ("fa.products.index", "en.products.index") and resolved with lroute().
|
| An optional {locale?} prefix segment cannot express this. Laravel reads the
| first segment of "/products" as the locale, fails the constraint, and returns
| 404 — so the unprefixed default locale would only ever match "/".
|
*/

$pages = function (): void {
    Route::get('/', HomeController::class)->name('home');

    // Catalogue
    Route::get('/products', [ProductController::class, 'index'])->name('products.index');
    Route::get('/products/{product:slug}', [ProductController::class, 'show'])->name('products.show');

    Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
    Route::get('/categories/{category:slug}', [CategoryController::class, 'show'])->name('categories.show');

    Route::get('/colors-and-decor', ColorDecorController::class)->name('colors-and-decor');

    Route::get('/search', SearchController::class)->name('search');
    Route::get('/compare', CompareController::class)->name('compare');

    // Editorial pages, driven by the pages table
    Route::get('/about', [PageController::class, 'about'])->name('about');
    Route::get('/factory', [PageController::class, 'factory'])->name('factory');
    Route::get('/production-process', [PageController::class, 'productionProcess'])->name('production-process');
    Route::get('/quality-control', [PageController::class, 'qualityControl'])->name('quality-control');

    // Showcase
    Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
    Route::get('/projects/{project:slug}', [ProjectController::class, 'show'])->name('projects.show');

    Route::get('/certificates', CertificateController::class)->name('certificates');

    Route::get('/catalog', [CatalogController::class, 'index'])->name('catalog.index');
    Route::post('/catalog/{catalog:slug}/request', [CatalogController::class, 'request'])
        ->name('catalog.request');
    Route::get('/catalog/{catalog:slug}/download', [CatalogController::class, 'download'])
        ->name('catalog.download');

    Route::get('/articles', [ArticleController::class, 'index'])->name('articles.index');
    Route::get('/articles/{article:slug}', [ArticleController::class, 'show'])->name('articles.show');

    Route::get('/representatives', RepresentativeController::class)->name('representatives');

    // Enquiries
    Route::get('/contact', [ContactController::class, 'create'])->name('contact');
    Route::post('/contact', [ContactController::class, 'store'])->name('contact.store');

    if (! app()->isProduction()) {
        // Development and review surface, never part of the live site.
        Route::view('/design-system', 'pages.design-system')->name('design-system');
    }
};

// Persian: the default locale, served from the root with no prefix.
Route::name('fa.')->group($pages);

// English: mounted under /en.
Route::prefix('en')->name('en.')->group($pages);
