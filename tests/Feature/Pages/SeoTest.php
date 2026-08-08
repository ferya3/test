<?php

declare(strict_types=1);

use App\Models\Article;
use App\Models\Product;
use App\Models\SeoMetadata;
use Database\Seeders\SettingSeeder;

beforeEach(function (): void {
    $this->seed(SettingSeeder::class);
});

it('carries the core SEO surface on every page', function (): void {
    $this->get('/')
        ->assertOk()
        ->assertSee('<meta name="description"', false)
        ->assertSee('<link rel="canonical" href="http://localhost">', false)
        ->assertSee('<meta property="og:type" content="website">', false)
        ->assertSee('<script type="application/ld+json"', false)
        ->assertSee('"@type":"Organization"', false)
        ->assertSee('"@type":"WebSite"', false);
});

it('emits hreflang alternates with x-default on every page', function (): void {
    $response = $this->get('/products')->assertOk();

    $response->assertSee('<link rel="alternate" hreflang="fa-IR" href="http://localhost/products">', false);
    $response->assertSee('<link rel="alternate" hreflang="en" href="http://localhost/en/products">', false);
    $response->assertSee('<link rel="alternate" hreflang="x-default" href="http://localhost/products">', false);
});

it('points the English alternate at the English URL and vice versa', function (): void {
    $this->get('/en/products')
        ->assertOk()
        ->assertSee('<link rel="alternate" hreflang="fa-IR" href="http://localhost/products">', false)
        ->assertSee('<link rel="alternate" hreflang="en" href="http://localhost/en/products">', false);
});

describe('a product detail page', function (): void {
    it('renders a canonical URL, a product OG type and Product JSON-LD', function (): void {
        $product = Product::factory()->create();

        $response = $this->get("/products/{$product->slug}")->assertOk();

        $response->assertSee("<link rel=\"canonical\" href=\"http://localhost/products/{$product->slug}\">", false);
        $response->assertSee('<meta property="og:type" content="product">', false);
        $response->assertSee('"@type":"Product"', false);
        $response->assertSee('"sku":"'.$product->code.'"', false);
    });

    it('lets a hand-authored SEO override win over the generated defaults', function (): void {
        $product = Product::factory()->create();

        $product->seo()->save(SeoMetadata::factory()->noindex()->make([
            'title' => ['fa' => 'عنوان دستی', 'en' => 'Custom title'],
            'canonical_url' => 'https://example.com/custom',
        ]));

        $response = $this->get("/products/{$product->slug}")->assertOk();

        $response->assertSee('<title>عنوان دستی</title>', false);
        $response->assertSee('<meta name="robots" content="noindex,nofollow">', false);
        $response->assertSee('<link rel="canonical" href="https://example.com/custom">', false);

        $this->get("/en/products/{$product->slug}")
            ->assertOk()
            ->assertSee('<title>Custom title</title>', false);
    });

    it('replaces the generated JSON-LD entirely when structured_data is hand-authored', function (): void {
        $product = Product::factory()->create();

        $product->seo()->save(SeoMetadata::factory()->make([
            'structured_data' => ['@context' => 'https://schema.org', '@graph' => [['@type' => 'FAQPage']]],
        ]));

        $response = $this->get("/products/{$product->slug}")->assertOk();

        $response->assertSee('"@type":"FAQPage"', false);
        $response->assertDontSee('"@type":"Product"', false);
    });
});

it('renders Article JSON-LD on an article page', function (): void {
    $article = Article::factory()->create();

    $this->get("/articles/{$article->slug}")
        ->assertOk()
        ->assertSee('"@type":"Article"', false)
        ->assertSee('"headline":"'.$article->title.'"', false);
});

it('keeps search and compare out of the index', function (): void {
    $this->get('/search')->assertOk()->assertSee('<meta name="robots" content="noindex,follow">', false);
    $this->get('/compare')->assertOk()->assertSee('<meta name="robots" content="noindex,follow">', false);
});

describe('sitemap.xml', function (): void {
    it('lists a published product with its locale alternates', function (): void {
        $product = Product::factory()->create();

        $response = $this->get('/sitemap.xml')->assertOk();
        $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');

        $xml = $response->getContent();

        expect($xml)->toContain("http://localhost/products/{$product->slug}")
            ->toContain("http://localhost/en/products/{$product->slug}")
            ->toContain('hreflang="x-default"');
    });

    it('omits an unpublished product', function (): void {
        $product = Product::factory()->inactive()->create();

        $xml = $this->get('/sitemap.xml')->getContent();

        expect($xml)->not->toContain($product->slug);
    });
});

it('serves a robots.txt that disallows the admin area and points at the sitemap', function (): void {
    $response = $this->get('/robots.txt')->assertOk();

    $response->assertHeader('Content-Type', 'text/plain; charset=UTF-8');
    expect($response->getContent())
        ->toContain('Disallow: /admin')
        ->toContain('Sitemap: http://localhost/sitemap.xml');
});
