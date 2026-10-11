<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Certificate;
use App\Models\Media;
use App\Queries\ArticleQuery;
use App\Queries\CompanyQuery;
use App\Queries\ProductQuery;
use App\Queries\ProjectQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Services\SettingsRepository;
use App\Support\Data\HomeIntro;
use Illuminate\Contracts\View\View;

class HomeController extends Controller
{
    public function __invoke(
        ProductQuery $products,
        ProjectQuery $projects,
        ArticleQuery $articles,
        CompanyQuery $companies,
        SeoManager $seo,
        SchemaGenerator $schema,
        SettingsRepository $settings,
    ): View {
        $categories = Category::query()
            ->active()
            ->roots()
            ->featured()
            ->with('cover')
            ->ordered()
            ->get();

        // Not queried at all while the holding is switched off, rather than
        // queried and then hidden by the template.
        $subsidiaries = config('features.holding') ? $companies->listing() : collect();

        return view('pages.home', [
            'companies' => $subsidiaries,
            'featuredProducts' => $products->featured(6),
            'categories' => $categories,
            // The homepage is a route rather than a Page record, so its hero
            // has no row to hang off and is referenced from settings, next to
            // the introduction text kept there for the same reason. Null is a
            // supported state: the hero falls back to its own textured band.
            'hero' => Media::find($settings->get('home_hero_media_id')),
            'intro' => HomeIntro::fromSettings($settings, [
                [
                    'label' => __('pages.home.fact_founded'),
                    'value' => (string) $settings->get('founded_year', ''),
                ],
                [
                    'label' => __('pages.home.fact_groups'),
                    // Read off the collection already loaded above rather than
                    // counting again — the homepage should not pay for a query
                    // to tell the reader something it is about to render.
                    'value' => (string) $categories->count(),
                ],
            ]),
            'featuredProjects' => $projects->featured(3),
            'latestArticles' => $articles->latest(3),
            'certificates' => Certificate::query()
                ->active()
                ->valid()
                ->with('image')
                ->ordered()
                ->limit(6)
                ->get(),
            'seo' => $seo->forPage(
                routeName: 'home',
                title: $settings->translated('seo_default_title') ?? config('app.name'),
                description: $settings->translated('seo_default_description') ?? '',
                structuredData: $schema->graph([$schema->organization($subsidiaries), $schema->website()]),
                suffixTitle: false,
            ),
        ]);
    }
}
