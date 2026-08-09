<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Certificate;
use App\Queries\ArticleQuery;
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

        return view('pages.home', [
            'featuredProducts' => $products->featured(6),
            'categories' => $categories,
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
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
                suffixTitle: false,
            ),
        ]);
    }
}
