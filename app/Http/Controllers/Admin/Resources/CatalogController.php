<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Catalog;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;

class CatalogController extends CrudController
{
    protected function model(): string
    {
        return Catalog::class;
    }

    protected function resource(): string
    {
        return 'catalogs';
    }

    protected function title(): string
    {
        return __('admin.resources.catalogs');
    }

    protected function fields(): array
    {
        return [
            Field::translated('title', __('admin.field.title'), required: true)->listed(),
            Field::translated('description', __('admin.field.description'), long: true),
            Field::media('cover_media_id', __('admin.field.cover')),
            Field::media('file_media_id', __('admin.field.file'), __('admin.hint.pdf_only')),
            Field::text('version', __('admin.field.version'))->listed(),
            Field::date('published_at', __('admin.field.published_at')),
            Field::checkbox('requires_registration', __('admin.field.requires_registration'))
                ->hint(__('admin.hint.gated_download'))
                ->listed(),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
            Field::number('download_count', __('admin.field.downloads'))->readOnly(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Catalog::query()->orderBy('position')->orderBy('id');
    }

    protected function searchable(): array
    {
        return ['title', 'version'];
    }
}
