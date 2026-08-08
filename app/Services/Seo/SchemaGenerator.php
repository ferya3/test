<?php

declare(strict_types=1);

namespace App\Services\Seo;

use App\Models\Article;
use App\Models\Media;
use App\Models\Product;
use App\Services\SettingsRepository;

/**
 * Builds the JSON-LD nodes that back the site's structured data, combined by
 * `graph()` into a single `@graph` document per page.
 *
 * An entity's own `seo_metadata.structured_data` — hand-authored in the admin
 * — always wins over anything built here; SeoManager applies that override
 * before a page ever reaches these methods, so a generated node only ever
 * ships when nobody has written a more specific one.
 */
class SchemaGenerator
{
    public function __construct(private readonly SettingsRepository $settings) {}

    /**
     * Emitted on every page: identifies the business behind the site,
     * independent of whatever the page itself is about.
     *
     * @return array<string, mixed>
     */
    public function organization(): array
    {
        $sameAs = array_values(array_filter([
            $this->settings->get('social_instagram'),
            $this->settings->get('social_linkedin'),
            $this->settings->get('social_youtube'),
            $this->settings->get('social_telegram'),
        ]));

        return array_filter([
            '@type' => 'Organization',
            '@id' => url('/').'#organization',
            'name' => $this->settings->translated('company_name') ?? config('app.name'),
            'description' => $this->settings->translated('company_description'),
            'url' => url('/'),
            'foundingDate' => $this->settings->get('founded_year'),
            'email' => $this->settings->get('contact_email'),
            'telephone' => $this->settings->get('contact_phone'),
            'address' => array_filter([
                '@type' => 'PostalAddress',
                'streetAddress' => $this->settings->translated('contact_address'),
                'addressCountry' => 'IR',
            ]),
            'sameAs' => $sameAs === [] ? null : $sameAs,
        ], static fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * Emitted on every page: gives search engines the sitewide search box.
     *
     * @return array<string, mixed>
     */
    public function website(): array
    {
        return [
            '@type' => 'WebSite',
            '@id' => url('/').'#website',
            'name' => $this->settings->translated('company_name') ?? config('app.name'),
            'url' => url('/'),
            'publisher' => ['@id' => url('/').'#organization'],
            'potentialAction' => [
                '@type' => 'SearchAction',
                'target' => [
                    '@type' => 'EntryPoint',
                    'urlTemplate' => lroute('search').'?q={search_term_string}',
                ],
                'query-input' => 'required name=search_term_string',
            ],
        ];
    }

    /**
     * @param  list<array{label: string, url?: string|null}>  $items  Ordered
     *                                                                from the homepage to the current page; the current page's `url`
     *                                                                may be omitted since it is not a link.
     * @return array<string, mixed>
     */
    public function breadcrumbs(array $items): array
    {
        return [
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_values(array_map(
                static fn (array $item, int $index): array => array_filter([
                    '@type' => 'ListItem',
                    'position' => $index + 1,
                    'name' => $item['label'],
                    'item' => $item['url'] ?? null,
                ], static fn (mixed $value): bool => $value !== null),
                $items,
                array_keys($items),
            )),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function product(Product $product, string $canonical): array
    {
        $images = array_values(array_filter([
            $product->mainImage?->absoluteUrl(),
            ...$product->gallery->map(static fn (Media $media): string => $media->absoluteUrl()),
        ]));

        $properties = $product->specifications->map(static fn ($spec): array => array_filter([
            '@type' => 'PropertyValue',
            'name' => $spec->label,
            'value' => trim($spec->value.' '.($spec->unit ?? '')),
        ]))->all();

        return array_filter([
            '@type' => 'Product',
            '@id' => $canonical.'#product',
            'name' => $product->name,
            'description' => $product->short_description ?: $product->description,
            'sku' => $product->code,
            'url' => $canonical,
            'image' => $images === [] ? null : $images,
            'category' => $product->category?->name,
            'brand' => [
                '@type' => 'Brand',
                'name' => $this->settings->translated('company_name') ?? config('app.name'),
            ],
            'additionalProperty' => $properties === [] ? null : $properties,
        ], static fn (mixed $value): bool => $value !== null && $value !== []);
    }

    /**
     * @return array<string, mixed>
     */
    public function article(Article $article, string $canonical): array
    {
        return array_filter([
            '@type' => 'Article',
            '@id' => $canonical.'#article',
            'headline' => $article->title,
            'description' => $article->excerpt,
            'image' => $article->cover?->absoluteUrl(),
            'datePublished' => $article->published_at?->toIso8601String(),
            'dateModified' => $article->updated_at?->toIso8601String(),
            'url' => $canonical,
            'mainEntityOfPage' => $canonical,
            'author' => $article->author !== null ? [
                '@type' => 'Person',
                'name' => $article->author->name,
            ] : ['@id' => url('/').'#organization'],
            'publisher' => ['@id' => url('/').'#organization'],
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * Combines any number of nodes (or arrays of nodes) into one JSON-LD
     * document. Falsy entries are dropped so a caller can pass a conditional
     * node (e.g. an article schema only on article pages) without branching.
     *
     * @param  array<int, array<string, mixed>|null>  $nodes
     * @return array<string, mixed>
     */
    public function graph(array $nodes): array
    {
        return [
            '@context' => 'https://schema.org',
            '@graph' => array_values(array_filter($nodes)),
        ];
    }
}
