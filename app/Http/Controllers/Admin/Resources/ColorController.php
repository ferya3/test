<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Models\Color;
use App\Support\Admin\Field;
use App\Support\Enums\ColorFamily;

class ColorController extends AttributeCrudController
{
    protected function model(): string
    {
        return Color::class;
    }

    protected function resource(): string
    {
        return 'colors';
    }

    protected function title(): string
    {
        return __('admin.resources.colors');
    }

    protected function extraFields(): array
    {
        return [
            Field::color('hex', __('admin.field.hex'))->listed(),
            Field::enum('color_family', __('admin.field.family'), ColorFamily::class),
            Field::media('media_id', __('admin.field.swatch')),
        ];
    }
}
