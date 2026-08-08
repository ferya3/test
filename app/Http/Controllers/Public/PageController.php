<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use App\Models\Page;
use Illuminate\Contracts\View\View;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The editorial pages. Their content lives in the pages/page_sections tables so
 * an editor can change it, while the template decides how sections are laid out.
 */
class PageController extends Controller
{
    public function about(): View
    {
        return $this->render('about', 'pages.editorial.about');
    }

    public function factory(): View
    {
        return $this->render('factory', 'pages.editorial.factory');
    }

    public function productionProcess(): View
    {
        return $this->render('production-process', 'pages.editorial.process');
    }

    public function qualityControl(): View
    {
        return $this->render('quality-control', 'pages.editorial.quality', [
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
    private function render(string $slug, string $view, array $extra = []): View
    {
        $page = Page::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->with(['hero', 'sections.image', 'seo'])
            ->first();

        if ($page === null) {
            throw new NotFoundHttpException;
        }

        return view($view, [...$extra, 'page' => $page]);
    }
}
