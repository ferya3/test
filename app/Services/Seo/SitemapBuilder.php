<?php

declare(strict_types=1);

namespace App\Services\Seo;

use App\Models\Article;
use App\Models\Category;
use App\Models\Page;
use App\Models\Product;
use App\Models\Project;
use App\Services\Cache\SitemapCache;
use App\Services\Localization\LocaleManager;
use Illuminate\Support\Carbon;
use Spatie\Sitemap\Sitemap;
use Spatie\Sitemap\Tags\Url;

/**
 * Builds sitemap.xml.
 *
 * Every indexable page gets one <url> entry per locale it actually has
 * content in — a product with no English translation yet does not get an
 * English sitemap entry that 404s, or worse, silently falls back to Persian
 * under an English URL. Each entry carries hreflang alternates to every other
 * locale version plus x-default, per Google's multilingual sitemap guidance.
 *
 * Rebuilding walks the whole catalogue, editorial and showcase tables, so the
 * result is cached (SitemapCache) and only invalidated when one of those
 * tables changes.
 */
class SitemapBuilder
{
    /**
     * route name => Page slug, for the four editorial pages. All four route
     * names happen to equal their slug, but the map keeps that an
     * implementation detail rather than an assumption baked into the query.
     */
    private const array EDITORIAL_PAGES = [
        'about' => 'about',
        'factory' => 'factory',
        'production-process' => 'production-process',
        'quality-control' => 'quality-control',
    ];

    public function __construct(
        private readonly SitemapCache $cache,
        private readonly LocaleManager $locale,
    ) {}

    public function render(): string
    {
        return $this->cache->remember(fn (): string => $this->build()->render());
    }

    private function build(): Sitemap
    {
        $sitemap = Sitemap::create();

        $this->addRoute($sitemap, 'home', priority: 1.0, changeFrequency: Url::CHANGE_FREQUENCY_WEEKLY);
        $this->addRoute($sitemap, 'products.index', priority: 0.9, changeFrequency: Url::CHANGE_FREQUENCY_DAILY);
        $this->addRoute($sitemap, 'categories.index', priority: 0.7);
        $this->addRoute($sitemap, 'colors-and-decor', priority: 0.6);
        $this->addRoute($sitemap, 'projects.index', priority: 0.6);
        $this->addRoute($sitemap, 'certificates', priority: 0.5);
        $this->addRoute($sitemap, 'catalog.index', priority: 0.5);
        $this->addRoute($sitemap, 'articles.index', priority: 0.6, changeFrequency: Url::CHANGE_FREQUENCY_DAILY);
        $this->addRoute($sitemap, 'representatives', priority: 0.5);
        $this->addRoute($sitemap, 'contact', priority: 0.5);

        $this->addEditorialPages($sitemap);
        $this->addProducts($sitemap);
        $this->addCategories($sitemap);
        $this->addProjects($sitemap);
        $this->addArticles($sitemap);

        return $sitemap;
    }

    private function addEditorialPages(Sitemap $sitemap): void
    {
        $activeSlugs = Page::query()->where('is_active', true)->pluck('slug')->all();

        foreach (self::EDITORIAL_PAGES as $routeName => $slug) {
            if (in_array($slug, $activeSlugs, true)) {
                $this->addRoute($sitemap, $routeName, priority: 0.6);
            }
        }
    }

    private function addProducts(Sitemap $sitemap): void
    {
        Product::query()->published()->select(['slug', 'name', 'short_description', 'description', 'updated_at'])
            ->each(fn (Product $product) => $this->addRoute(
                $sitemap,
                'products.show',
                ['product' => $product->slug],
                priority: 0.8,
                lastModified: $product->updated_at,
                locales: $product->translatedLocales(),
            ));
    }

    private function addCategories(Sitemap $sitemap): void
    {
        Category::query()->active()->select(['slug', 'name', 'short_description', 'description', 'updated_at'])
            ->each(fn (Category $category) => $this->addRoute(
                $sitemap,
                'categories.show',
                ['category' => $category->slug],
                priority: 0.7,
                lastModified: $category->updated_at,
                locales: $category->translatedLocales(),
            ));
    }

    private function addProjects(Sitemap $sitemap): void
    {
        Project::query()->active()
            ->select(['slug', 'title', 'client', 'location', 'summary', 'body', 'updated_at'])
            ->each(fn (Project $project) => $this->addRoute(
                $sitemap,
                'projects.show',
                ['project' => $project->slug],
                priority: 0.5,
                lastModified: $project->updated_at,
                locales: $project->translatedLocales(),
            ));
    }

    private function addArticles(Sitemap $sitemap): void
    {
        Article::query()->published()->select(['slug', 'title', 'excerpt', 'body', 'updated_at'])
            ->each(fn (Article $article) => $this->addRoute(
                $sitemap,
                'articles.show',
                ['article' => $article->slug],
                priority: 0.5,
                lastModified: $article->updated_at,
                locales: $article->translatedLocales(),
            ));
    }

    /**
     * Adds one <url> per locale, each carrying alternate links to every other
     * requested locale plus x-default.
     *
     * @param  array<string, mixed>  $params
     * @param  list<string>|null  $locales  Defaults to every configured locale.
     */
    private function addRoute(
        Sitemap $sitemap,
        string $routeName,
        array $params = [],
        float $priority = 0.5,
        string $changeFrequency = Url::CHANGE_FREQUENCY_MONTHLY,
        ?Carbon $lastModified = null,
        ?array $locales = null,
    ): void {
        $locales ??= $this->locale->codes();

        if ($locales === []) {
            return;
        }

        foreach ($locales as $locale) {
            $url = Url::create(lroute($routeName, $params, $locale))
                ->setPriority($priority)
                ->setChangeFrequency($changeFrequency);

            if ($lastModified !== null) {
                $url->setLastModificationDate($lastModified);
            }

            foreach ($locales as $alternateLocale) {
                $url->addAlternate(lroute($routeName, $params, $alternateLocale), $this->locale->hreflang($alternateLocale));
            }

            $url->addAlternate(lroute($routeName, $params, $this->locale->default()), 'x-default');

            $sitemap->add($url);
        }
    }
}
