<?php

declare(strict_types=1);

namespace App\Queries;

use App\Models\Article;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class ArticleQuery
{
    /**
     * @var list<string>
     */
    public const array CARD_RELATIONS = ['category:id,slug,name', 'cover'];

    public function paginate(?string $categorySlug = null, int $perPage = 9): LengthAwarePaginator
    {
        return Article::query()
            ->published()
            ->when(
                $categorySlug !== null,
                fn ($query) => $query->whereHas('category', fn ($q) => $q->where('slug', $categorySlug)),
            )
            ->with(self::CARD_RELATIONS)
            ->latestFirst()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * @return Collection<int, Article>
     */
    public function featured(int $limit = 3): Collection
    {
        return Article::query()
            ->published()
            ->featured()
            ->with(self::CARD_RELATIONS)
            ->latestFirst()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Article>
     */
    public function latest(int $limit = 3): Collection
    {
        return Article::query()
            ->published()
            ->with(self::CARD_RELATIONS)
            ->latestFirst()
            ->limit($limit)
            ->get();
    }

    /**
     * Other articles in the same topic, excluding the one being read.
     *
     * @return Collection<int, Article>
     */
    public function related(Article $article, int $limit = 3): Collection
    {
        return Article::query()
            ->published()
            ->whereKeyNot($article->getKey())
            ->when(
                $article->article_category_id !== null,
                fn ($query) => $query->where('article_category_id', $article->article_category_id),
            )
            ->with(self::CARD_RELATIONS)
            ->latestFirst()
            ->limit($limit)
            ->get();
    }
}
