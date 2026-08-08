<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Category;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\Rule;

class CategoryController extends CrudController
{
    protected function model(): string
    {
        return Category::class;
    }

    protected function resource(): string
    {
        return 'categories';
    }

    protected function title(): string
    {
        return __('admin.resources.categories');
    }

    protected function fields(): array
    {
        return [
            Field::translated('name', __('admin.field.name'), required: true)->listed(),
            Field::select('parent_id', __('admin.field.parent'), $this->parentOptions()),
            Field::translated('short_description', __('admin.field.short_description')),
            Field::translated('description', __('admin.field.description'), long: true),
            Field::media('cover_media_id', __('admin.field.cover')),
            Field::number('position', __('admin.field.position'))->listed(),
            Field::checkbox('is_featured', __('admin.field.featured'))->listed(),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function rules(?Model $record = null): array
    {
        return [
            ...parent::rules($record),
            'parent_id' => [
                'nullable',
                'integer',
                Rule::exists('categories', 'id'),
                // A category cannot be its own parent; deeper cycles are
                // prevented by only offering root categories as parents.
                Rule::notIn(array_filter([$record?->getKey()])),
            ],
        ];
    }

    /**
     * Deleting a category with products would orphan them, and the foreign key
     * is restrictOnDelete — so it is refused with an explanation rather than
     * surfacing a database error.
     */
    public function destroy(string|int $id): RedirectResponse
    {
        $record = $this->findOrFail($id);

        $this->authorize('delete', $record);

        if ($record->products()->exists()) {
            return back()->withErrors(['delete' => __('admin.category_has_products')]);
        }

        $record->delete();

        return redirect()
            ->route('admin.categories.index')
            ->with('status', __('admin.deleted'));
    }

    protected function indexQuery(): Builder
    {
        return Category::query()->with('parent')->orderBy('position')->orderBy('id');
    }

    protected function searchable(): array
    {
        return ['name', 'slug'];
    }

    /**
     * Only root categories are offered, which keeps the tree two levels deep
     * and makes a cycle impossible.
     *
     * @return array<string, string>
     */
    private function parentOptions(): array
    {
        return Category::query()
            ->whereNull('parent_id')
            ->orderBy('position')
            ->get()
            ->mapWithKeys(fn (Category $c): array => [(string) $c->id => (string) $c->name])
            ->all();
    }
}
