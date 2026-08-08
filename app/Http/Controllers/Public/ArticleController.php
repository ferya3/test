<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Queries\ArticleQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ArticleController extends Controller
{
    public function index(Request $request, ArticleQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        $category = $request->string('category')->toString() ?: null;

        return view('pages.articles.index', [
            'articles' => $query->paginate($category),
            'categories' => ArticleCategory::query()->active()->ordered()->get(),
            'activeCategory' => $category,
            'seo' => $seo->forPage(
                routeName: 'articles.index',
                title: __('pages.articles.heading'),
                description: __('pages.articles.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    public function show(Article $article, ArticleQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        if (! $article->isPublished()) {
            throw new NotFoundHttpException;
        }

        $article->load(['category', 'cover', 'author', 'seo.ogImage']);

        $canonical = $seo->canonicalFor($article, 'articles.show', ['article' => $article->slug]);

        return view('pages.articles.show', [
            'article' => $article,
            'related' => $query->related($article),
            'seo' => $seo->forModel(
                model: $article,
                routeName: 'articles.show',
                routeParams: ['article' => $article->slug],
                fallbackTitle: $article->title,
                fallbackDescription: $article->excerpt ?: Str::limit(strip_tags((string) $article->body), 160),
                fallbackImage: $article->cover,
                ogType: 'article',
                structuredData: $schema->graph([
                    $schema->organization(),
                    $schema->website(),
                    $schema->article($article, $canonical),
                ]),
            ),
        ]);
    }
}
