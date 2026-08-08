<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\Material;
use App\Support\Admin\Field;

class MaterialController extends AttributeCrudController
{
    protected function model(): string
    {
        return Material::class;
    }

    protected function resource(): string
    {
        return 'materials';
    }

    protected function title(): string
    {
        return __('admin.resources.materials');
    }

    protected function extraFields(): array
    {
        return [Field::translated('description', __('admin.field.description'), long: true)];
    }
}
