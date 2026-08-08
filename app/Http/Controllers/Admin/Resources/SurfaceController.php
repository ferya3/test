<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\Surface;
use App\Support\Admin\Field;

class SurfaceController extends AttributeCrudController
{
    protected function model(): string
    {
        return Surface::class;
    }

    protected function resource(): string
    {
        return 'surfaces';
    }

    protected function title(): string
    {
        return __('admin.resources.surfaces');
    }

    protected function extraFields(): array
    {
        return [
            Field::translated('description', __('admin.field.description'), long: true),
            Field::number('gloss_level', __('admin.field.gloss'), ['nullable', 'integer', 'min:0', 'max:100'])->listed(),
        ];
    }
}
