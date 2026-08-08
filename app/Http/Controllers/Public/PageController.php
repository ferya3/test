<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use App\Models\Page;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The editorial pages. Their content lives in the pages/page_sections tables so
 * an editor can change it, while the template decides how sections are laid out.
 */
class PageController extends Controller
{
    public function about(SeoManager $seo, SchemaGenerator $schema): View
    {
        return $this->render('about', 'pages.editorial.about', seo: $seo, schema: $schema);
    }

    public function factory(SeoManager $seo, SchemaGenerator $schema): View
    {
        return $this->render('factory', 'pages.editorial.factory', seo: $seo, schema: $schema);
    }

    public function productionProcess(SeoManager $seo, SchemaGenerator $schema): View
    {
        return $this->render('production-process', 'pages.editorial.process', seo: $seo, schema: $schema);
    }

    public function qualityControl(SeoManager $seo, SchemaGenerator $schema): View
    {
        return $this->render('quality-control', 'pages.editorial.quality', seo: $seo, schema: $schema, extra: [
            'certificates' => Certificate::query()
                ->active()
                ->valid()
                ->with('image')
                ->ordered()
                ->limit(4)
                ->get(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function render(string $slug, string $view, SeoManager $seo, SchemaGenerator $schema, array $extra = []): View
    {
        $page = Page::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->with(['hero', 'sections.image', 'seo.ogImage'])
            ->first();

        if ($page === null) {
            throw new NotFoundHttpException;
        }

        return view($view, [
            ...$extra,
            'page' => $page,
            'seo' => $seo->forModel(
                model: $page,
                routeName: $slug,
                routeParams: [],
                fallbackTitle: $page->title,
                fallbackDescription: $page->subtitle ?: Str::limit(strip_tags((string) $page->body), 160),
                fallbackImage: $page->hero,
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }
}
