<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Company;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;

class CompanyController extends CrudController
{
    protected function model(): string
    {
        return Company::class;
    }

    protected function resource(): string
    {
        return 'companies';
    }

    protected function title(): string
    {
        return __('admin.resources.companies');
    }

    protected function fields(): array
    {
        return [
            Field::translated('name', __('admin.field.name'), required: true)->listed(),
            Field::translated('sector', __('admin.field.sector'))->listed(),
            Field::translated('tagline', __('admin.field.tagline')),
            Field::translated('summary', __('admin.field.summary')),
            Field::translated('body', __('admin.field.body'), long: true),
            Field::translated('location', __('admin.field.location')),

            Field::number('founded_year', __('admin.field.founded_year'), ['nullable', 'integer', 'min:1900', 'max:2200']),
            Field::number('employees', __('admin.field.employees'), ['nullable', 'integer', 'min:0', 'max:1000000']),
            Field::number('site_area_sqm', __('admin.field.site_area'), ['nullable', 'integer', 'min:0', 'max:100000000']),
            Field::translated('capacity', __('admin.field.capacity'))->hint(__('admin.hint.capacity')),

            Field::color('accent_hex', __('admin.field.accent'))->hint(__('admin.hint.accent')),
            Field::media('logo_media_id', __('admin.field.logo')),
            Field::media('cover_media_id', __('admin.field.cover')),

            Field::text('website_url', __('admin.field.website'), ['nullable', 'url:https,http', 'max:190']),
            Field::text('email', __('admin.field.email'), ['nullable', 'email', 'max:190']),
            Field::text('phone', __('admin.field.phone'), ['nullable', 'string', 'max:32']),

            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Company::query()->ordered();
    }

    protected function searchable(): array
    {
        return ['name', 'slug'];
    }
}
