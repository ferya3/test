<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Support\Admin\Field;
use App\Support\Enums\ArticleStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class ArticleController extends CrudController
{
    protected function model(): string
    {
        return Article::class;
    }

    protected function resource(): string
    {
        return 'articles';
    }

    protected function title(): string
    {
        return __('admin.resources.articles');
    }

    protected function fields(): array
    {
        return [
            Field::translated('title', __('admin.field.title'), required: true)->listed(),
            Field::select('article_category_id', __('admin.field.category'), $this->categoryOptions())->listed(),
            Field::translated('excerpt', __('admin.field.excerpt')),
            Field::translated('body', __('admin.field.body'), required: true, long: true),
            Field::media('cover_media_id', __('admin.field.cover')),
            Field::enum('status', __('admin.field.status'), ArticleStatus::class, required: true)->listed(),
            Field::date('published_at', __('admin.field.published_at'))->listed(),
            Field::number('reading_time', __('admin.field.reading_time')),
            Field::checkbox('is_featured', __('admin.field.featured'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Article::query()->with('category:id,name')->latest('id');
    }

    protected function searchable(): array
    {
        return ['title', 'slug'];
    }

    protected function rules(?Model $record = null): array
    {
        return [
            ...parent::rules($record),
            'published_at' => ['nullable', 'date'],
        ];
    }

    /**
     * @return array<string, string>
     */
    private function categoryOptions(): array
    {
        return ArticleCategory::query()
            ->orderBy('position')
            ->get()
            ->mapWithKeys(fn (ArticleCategory $c): array => [(string) $c->id => (string) $c->name])
            ->all();
    }
}
