<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\Decor;
use App\Support\Admin\Field;
use App\Support\Enums\DecorFamily;

class DecorController extends AttributeCrudController
{
    protected function model(): string
    {
        return Decor::class;
    }

    protected function resource(): string
    {
        return 'decors';
    }

    protected function title(): string
    {
        return __('admin.resources.decors');
    }

    protected function extraFields(): array
    {
        return [
            Field::text('code', __('admin.field.code'))->listed(),
            Field::translated('description', __('admin.field.description'), long: true),
            Field::enum('decor_family', __('admin.field.family'), DecorFamily::class),
            Field::media('media_id', __('admin.field.sample')),
        ];
    }

    protected function searchable(): array
    {
        return ['name', 'slug', 'code'];
    }
}
