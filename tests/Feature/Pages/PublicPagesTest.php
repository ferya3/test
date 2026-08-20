<?php

declare(strict_types=1);

use App\Models\Article;
use App\Models\Category;
use App\Models\Product;
use App\Models\Project;
use Database\Seeders\ArticleSeeder;
use Database\Seeders\AttributeSeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PageSeeder;
use Database\Seeders\ProductSeeder;
use Database\Seeders\RepresentativeSeeder;
use Database\Seeders\SettingSeeder;
use Database\Seeders\ShowcaseSeeder;

/**
 * Every public page, in both locales, against realistic seeded content.
 *
 * Model::preventLazyLoading is on outside production, so any missing eager load
 * fails these tests rather than quietly costing a query per row in production.
 */
beforeEach(function (): void {
    $this->seed([
        SettingSeeder::class,
        AttributeSeeder::class,
        CategorySeeder::class,
        ProductSeeder::class,
        PageSeeder::class,
        ArticleSeeder::class,
        ShowcaseSeeder::class,
        RepresentativeSeeder::class,
    ]);
});

dataset('locale prefixes', [
    'persian' => [''],
    'english' => ['/en'],
]);

it('renders every static page', function (string $prefix): void {
    $paths = [
        '/',
        '/categories/hpl-cabinet-panel',
        '/categories',
        '/colors-and-decor',
        '/about',
        '/factory',
        '/production-process',
        '/quality-control',
        '/projects',
        '/certificates',
        '/catalog',
        '/articles',
        '/representatives',
        '/contact',
        '/search',
        '/compare',
    ];

    foreach ($paths as $path) {
        $url = rtrim($prefix.$path, '/') ?: '/';

        $this->get($url)->assertOk();
    }
})->with('locale prefixes');

it('renders every detail page', function (string $prefix): void {
    $product = Product::query()->published()->firstOrFail();
    $category = Category::query()->where('is_active', true)->firstOrFail();
    $project = Project::query()->where('is_active', true)->firstOrFail();
    $article = Article::query()->published()->firstOrFail();

    $this->get("{$prefix}/products/{$product->slug}")->assertOk();
    $this->get("{$prefix}/categories/{$category->slug}")->assertOk();
    $this->get("{$prefix}/projects/{$project->slug}")->assertOk();
    $this->get("{$prefix}/articles/{$article->slug}")->assertOk();
})->with('locale prefixes');

it('serves the two locales at different URLs with the right direction', function (): void {
    $this->get('/')->assertOk()->assertSee('<html lang="fa" dir="rtl"', escape: false);
    $this->get('/en')->assertOk()->assertSee('<html lang="en" dir="ltr"', escape: false);
});

it('does not treat a path that merely starts with the prefix as a locale', function (): void {
    // "enclosures" must not be read as the "en" locale.
    $this->get('/enclosures')->assertNotFound();
});

describe('unpublished content', function (): void {
    it('hides an inactive product', function (): void {
        $product = Product::factory()->inactive()->create();

        $this->get("/products/{$product->slug}")->assertNotFound();
    });

    it('hides a product scheduled for the future', function (): void {
        $product = Product::factory()->scheduled()->create();

        $this->get("/products/{$product->slug}")->assertNotFound();
    });

    it('hides a draft article', function (): void {
        $article = Article::factory()->draft()->create();

        $this->get("/articles/{$article->slug}")->assertNotFound();
    });

    it('hides an article scheduled for the future', function (): void {
        $article = Article::factory()->scheduled()->create();

        $this->get("/articles/{$article->slug}")->assertNotFound();
    });

    it('hides an inactive project', function (): void {
        $project = Project::factory()->inactive()->create();

        $this->get("/projects/{$project->slug}")->assertNotFound();
    });

    it('hides an inactive category', function (): void {
        $category = Category::factory()->inactive()->create();

        $this->get("/categories/{$category->slug}")->assertNotFound();
    });
});
