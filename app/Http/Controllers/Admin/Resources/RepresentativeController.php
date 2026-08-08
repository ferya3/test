<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Representative;
use App\Support\Admin\Field;
use App\Support\IranProvinces;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;

class RepresentativeController extends CrudController
{
    protected function model(): string
    {
        return Representative::class;
    }

    protected function resource(): string
    {
        return 'representatives';
    }

    protected function title(): string
    {
        return __('admin.resources.representatives');
    }

    protected function fields(): array
    {
        return [
            Field::translated('name', __('admin.field.name'), required: true)->listed(),
            Field::translated('company', __('admin.field.company')),
            Field::select('province', __('admin.field.province'), collect(IranProvinces::all())
                ->mapWithKeys(fn (string $p): array => [$p => $p])
                ->all())->rules(['required', Rule::in(IranProvinces::all())])->listed()->required(),
            Field::text('city', __('admin.field.city'), ['required', 'string', 'max:64'])->listed()->required(),
            Field::translated('address', __('admin.field.address')),
            Field::text('phone', __('admin.field.phone'), ['required', 'string', 'max:32'])->listed()->required(),
            Field::text('mobile', __('admin.field.mobile'), ['nullable', 'string', 'max:32']),
            Field::text('email', __('admin.field.email'), ['nullable', 'email', 'max:190']),
            Field::text('website', __('admin.field.website'), ['nullable', 'url', 'max:190']),
            Field::text('latitude', __('admin.field.latitude'), ['nullable', 'numeric', 'between:-90,90']),
            Field::text('longitude', __('admin.field.longitude'), ['nullable', 'numeric', 'between:-180,180']),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_featured', __('admin.field.featured')),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Representative::query()->orderBy('province')->orderBy('position');
    }

    protected function searchable(): array
    {
        return ['name', 'province', 'city', 'phone'];
    }
}
