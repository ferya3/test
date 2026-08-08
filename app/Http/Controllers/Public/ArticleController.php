<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Queries\ArticleQuery;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ArticleController extends Controller
{
    public function index(Request $request, ArticleQuery $query): View
    {
        $category = $request->string('category')->toString() ?: null;

        return view('pages.articles.index', [
            'articles' => $query->paginate($category),
            'categories' => ArticleCategory::query()->active()->ordered()->get(),
            'activeCategory' => $category,
        ]);
    }

    public function show(Article $article, ArticleQuery $query): View
    {
        if (! $article->isPublished()) {
            throw new NotFoundHttpException;
        }

        $article->load(['category', 'cover', 'author', 'seo']);

        return view('pages.articles.show', [
            'article' => $article,
            'related' => $query->related($article),
        ]);
    }
}
