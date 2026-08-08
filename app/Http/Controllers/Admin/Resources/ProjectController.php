<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Product;
use App\Models\Project;
use App\Support\Admin\Field;
use App\Support\Enums\ProjectType;
use Illuminate\Database\Eloquent\Builder;

class ProjectController extends CrudController
{
    protected function model(): string
    {
        return Project::class;
    }

    protected function resource(): string
    {
        return 'projects';
    }

    protected function title(): string
    {
        return __('admin.resources.projects');
    }

    protected function fields(): array
    {
        return [
            Field::translated('title', __('admin.field.title'), required: true)->listed(),
            Field::translated('client', __('admin.field.client')),
            Field::translated('location', __('admin.field.location')),
            Field::translated('summary', __('admin.field.summary')),
            Field::translated('body', __('admin.field.body'), long: true),
            Field::media('cover_media_id', __('admin.field.cover')),
            Field::enum('project_type', __('admin.field.project_type'), ProjectType::class)->listed(),
            Field::number('year', __('admin.field.year'), ['nullable', 'integer', 'min:1900', 'max:2200'])->listed(),
            Field::number('area_sqm', __('admin.field.area')),
            Field::relation('products', __('admin.field.products_used'), $this->productOptions(), 'products'),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_featured', __('admin.field.featured'))->listed(),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Project::query()->orderBy('position')->orderByDesc('id');
    }

    protected function searchable(): array
    {
        return ['title', 'slug'];
    }

    /**
     * @return array<string, string>
     */
    private function productOptions(): array
    {
        return Product::query()
            ->orderBy('code')
            ->get()
            ->mapWithKeys(fn (Product $p): array => [(string) $p->id => "{$p->code} — {$p->name}"])
            ->all();
    }
}
