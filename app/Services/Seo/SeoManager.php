<?php

declare(strict_types=1);

namespace App\Services\Seo;

use App\Models\Media;
use App\Models\SeoMetadata;
use App\Services\SettingsRepository;
use App\Support\Data\SeoData;
use Illuminate\Database\Eloquent\Model;

/**
 * Resolves the SeoData view model for a page.
 *
 * Precedence is the same for every field: an explicit `seo_metadata` override
 * on the entity wins, then the caller's page-derived default (a product's own
 * name and description, say), then the site-wide default in the `seo`
 * settings group. A controller calls one method here and passes the result
 * straight to the layout — no page hand-rolls its own <head>, so none can
 * forget a canonical tag or ship an empty description.
 */
class SeoManager
{
    private Media|false|null $defaultOgImage = null;

    public function __construct(private readonly SettingsRepository $settings) {}

    /**
     * A page with no backing Eloquent model: the homepage, listings, forms.
     *
     * @param  array<string, mixed>  $routeParams
     * @param  array<string, mixed>  $structuredData  Full JSON-LD document from SchemaGenerator::graph().
     */
    public function forPage(
        string $routeName,
        string $title,
        string $description,
        array $routeParams = [],
        array $structuredData = [],
        string $robots = 'index,follow',
        ?Media $ogImage = null,
        bool $suffixTitle = true,
    ): SeoData {
        $ogImage ??= $this->siteOgImage();

        return new SeoData(
            title: $suffixTitle ? $this->titleTag($title) : $title,
            description: $description,
            canonical: lroute($routeName, $routeParams),
            robots: $robots,
            ogTitle: $title,
            ogDescription: $description,
            ogImage: $ogImage?->absoluteUrl(),
            ogImageWidth: $ogImage?->width,
            ogImageHeight: $ogImage?->height,
            structuredData: $structuredData,
        );
    }

    /**
     * A page backed by an entity using HasSeoMetadata: a product, category,
     * article, project or editorial page. The entity must already have its
     * `seo.ogImage` relation eager loaded — lazy loading is disabled outside
     * production, so a forgotten eager load fails loudly in development
     * rather than silently costing an extra query in production.
     *
     * @param  array<string, mixed>  $routeParams
     * @param  array<string, mixed>  $structuredData  Full JSON-LD document from SchemaGenerator::graph(),
     *                                                used unless the entity carries a hand-authored override.
     */
    public function forModel(
        Model $model,
        string $routeName,
        array $routeParams,
        string $fallbackTitle,
        string $fallbackDescription,
        ?Media $fallbackImage = null,
        string $ogType = 'website',
        array $structuredData = [],
    ): SeoData {
        /** @var SeoMetadata|null $override */
        $override = $model->seo;

        // A hand-authored SEO title is used exactly as written — the whole
        // point of overriding it — whereas the model's own name/heading still
        // gets the " — Site Name" suffix a raw heading needs.
        $hasTitleOverride = $override?->title !== null && $override->title !== '';
        $title = $hasTitleOverride ? $override->title : $fallbackTitle;
        $titleTag = $hasTitleOverride ? $title : $this->titleTag($title);

        $description = $override?->description !== null && $override->description !== ''
            ? $override->description
            : $fallbackDescription;
        $ogImage = $override?->ogImage ?? $fallbackImage ?? $this->siteOgImage();

        return new SeoData(
            title: $titleTag,
            description: $description,
            canonical: $this->canonicalFor($model, $routeName, $routeParams),
            robots: $override?->robots ?: 'index,follow',
            ogTitle: $override?->og_title ?: $title,
            ogDescription: $override?->og_description ?: $description,
            ogType: $ogType,
            ogImage: $ogImage?->absoluteUrl(),
            ogImageWidth: $ogImage?->width,
            ogImageHeight: $ogImage?->height,
            twitterCard: $override?->twitter_card ?: 'summary_large_image',
            structuredData: $override?->structured_data ?? $structuredData,
        );
    }

    /**
     * A page that must not be indexed (search results, comparison trays):
     * still gets a canonical and a title, just no place in the index.
     *
     * @param  array<string, mixed>  $routeParams
     */
    public function forUnindexedPage(string $routeName, string $title, string $description, array $routeParams = []): SeoData
    {
        return $this->forPage($routeName, $title, $description, $routeParams, robots: 'noindex,follow');
    }

    /**
     * The canonical URL for an entity: its own override if it has one,
     * otherwise the route that renders it. Exposed so a controller can build
     * a JSON-LD node (which needs the same URL as its `@id`/`url`) before
     * calling forModel() itself.
     *
     * @param  array<string, mixed>  $routeParams
     */
    public function canonicalFor(Model $model, string $routeName, array $routeParams): string
    {
        /** @var SeoMetadata|null $override */
        $override = $model->seo;

        return $override?->canonical_url ?: lroute($routeName, $routeParams);
    }

    private function titleTag(string $title): string
    {
        $site = $this->settings->translated('company_name') ?? config('app.name');

        return $title === $site ? $title : "{$title} — {$site}";
    }

    /**
     * The site-wide fallback Open Graph image, memoised for the request —
     * most pages have their own image, so this is only ever queried on the
     * handful that do not.
     */
    private function siteOgImage(): ?Media
    {
        if ($this->defaultOgImage !== null) {
            return $this->defaultOgImage ?: null;
        }

        $mediaId = $this->settings->get('seo_default_og_media_id');
        $media = $mediaId === null ? null : Media::find($mediaId);

        $this->defaultOgImage = $media ?? false;

        return $media;
    }
}
