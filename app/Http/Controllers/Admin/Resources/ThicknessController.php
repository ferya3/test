<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Thickness;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

/**
 * Thickness has no translatable name — it is a number — so it does not extend
 * the attribute base.
 */
class ThicknessController extends CrudController
{
    protected function model(): string
    {
        return Thickness::class;
    }

    protected function resource(): string
    {
        return 'thicknesses';
    }

    protected function title(): string
    {
        return __('admin.resources.thicknesses');
    }

    protected function fields(): array
    {
        return [
            Field::text('value_mm', __('admin.field.value_mm'))->listed()->required(),
            Field::text('label', __('admin.field.label'))->listed(),
            Field::number('position', __('admin.field.position'))->listed(),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function rules(?Model $record = null): array
    {
        return [
            ...parent::rules($record),
            // The value is the filter key in product URLs, so a duplicate would
            // make two rows indistinguishable to the catalogue.
            'value_mm' => [
                'required',
                'numeric',
                'min:0.1',
                'max:100',
                Rule::unique('thicknesses', 'value_mm')->ignore($record?->getKey()),
            ],
        ];
    }

    protected function indexQuery(): Builder
    {
        return Thickness::query()->orderBy('value_mm');
    }
}
