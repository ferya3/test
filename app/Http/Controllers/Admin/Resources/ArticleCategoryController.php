<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\ArticleCategory;
use App\Support\Admin\Field;

class ArticleCategoryController extends AttributeCrudController
{
    protected function model(): string
    {
        return ArticleCategory::class;
    }

    protected function resource(): string
    {
        return 'article-categories';
    }

    protected function title(): string
    {
        return __('admin.resources.article_categories');
    }

    protected function extraFields(): array
    {
        return [Field::translated('description', __('admin.field.description'), long: true)];
    }
}
