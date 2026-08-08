<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;

/**
 * Shared base for the small ordered lookup tables — colours, decors, materials,
 * surfaces, applications. They differ only in their extra columns, so the
 * common fields live here rather than five times over.
 */
abstract class AttributeCrudController extends CrudController
{
    /**
     * @return list<Field>
     */
    protected function fields(): array
    {
        return [
            Field::translated('name', __('admin.field.name'), required: true)->listed(),
            ...$this->extraFields(),
            Field::number('position', __('admin.field.position'))->listed(),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    /**
     * @return list<Field>
     */
    protected function extraFields(): array
    {
        return [];
    }

    protected function indexQuery(): Builder
    {
        return $this->model()::query()->orderBy('position')->orderBy('id');
    }

    /**
     * Translated columns are matched on their raw JSON, which covers every
     * locale in one comparison.
     *
     * @return list<string>
     */
    protected function searchable(): array
    {
        return ['name', 'slug'];
    }
}
