<?php

declare(strict_types=1);

namespace App\Support\Data;

/**
 * Everything a page's <head> needs to render its SEO surface: meta tags, Open
 * Graph, Twitter Card and the combined JSON-LD graph.
 *
 * Built once per request by SeoManager and handed straight to the layout, so
 * no page assembles its own <title>/<meta> tags by hand and none can forget
 * the canonical tag or the structured data block.
 */
final readonly class SeoData
{
    /**
     * @param  array<string, mixed>  $structuredData  A complete JSON-LD document
     *                                                (`@context` + `@graph`), ready to encode as-is.
     */
    public function __construct(
        public string $title,
        public string $description,
        public string $canonical,
        public string $robots = 'index,follow',
        public string $ogTitle = '',
        public string $ogDescription = '',
        public string $ogType = 'website',
        public ?string $ogImage = null,
        public ?int $ogImageWidth = null,
        public ?int $ogImageHeight = null,
        public string $twitterCard = 'summary_large_image',
        public array $structuredData = [],
    ) {}
}
