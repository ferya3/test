<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\Application;
use App\Support\Admin\Field;

class ApplicationController extends AttributeCrudController
{
    protected function model(): string
    {
        return Application::class;
    }

    protected function resource(): string
    {
        return 'applications';
    }

    protected function title(): string
    {
        return __('admin.resources.applications');
    }

    protected function extraFields(): array
    {
        return [Field::translated('description', __('admin.field.description'), long: true)];
    }
}
