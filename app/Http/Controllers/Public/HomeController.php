<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Certificate;
use App\Queries\ArticleQuery;
use App\Queries\ProductQuery;
use App\Queries\ProjectQuery;
use Illuminate\Contracts\View\View;

class HomeController extends Controller
{
    public function __invoke(
        ProductQuery $products,
        ProjectQuery $projects,
        ArticleQuery $articles,
    ): View {
        return view('pages.home', [
            'featuredProducts' => $products->featured(6),
            'categories' => Category::query()
                ->active()
                ->roots()
                ->featured()
                ->with('cover')
                ->ordered()
                ->get(),
            'featuredProjects' => $projects->featured(3),
            'latestArticles' => $articles->latest(3),
            'certificates' => Certificate::query()
                ->active()
                ->valid()
                ->with('image')
                ->ordered()
                ->limit(6)
                ->get(),
        ]);
    }
}
