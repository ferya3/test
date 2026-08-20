<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Application;
use App\Models\Category;
use App\Models\Color;
use App\Models\Decor;
use App\Models\Material;
use App\Models\Product;
use App\Models\Surface;
use App\Models\Thickness;
use App\Support\Admin\Field;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class ProductController extends CrudController
{
    protected function model(): string
    {
        return Product::class;
    }

    protected function resource(): string
    {
        return 'products';
    }

    protected function title(): string
    {
        return __('admin.resources.products');
    }

    protected function fields(): array
    {
        return [
            Field::text('code', __('admin.field.code'))->listed()->required(),
            Field::translated('name', __('admin.field.name'), required: true)->listed(),
            Field::select('category_id', __('admin.field.category'), $this->options(Category::class))
                ->rules(['required', 'integer', Rule::exists('categories', 'id')])
                ->listed()
                ->required(),

            Field::select('material_id', __('admin.field.material'), $this->options(Material::class)),
            Field::select('surface_id', __('admin.field.surface'), $this->options(Surface::class))->listed(),
            Field::select('decor_id', __('admin.field.decor'), $this->decorOptions()),
            Field::select('color_id', __('admin.field.color'), $this->options(Color::class)),

            Field::relation('thicknesses', __('admin.field.thicknesses'), $this->thicknessOptions(), 'thicknesses'),
            Field::relation('applications', __('admin.field.applications'), $this->options(Application::class), 'applications'),

            Field::translated('short_description', __('admin.field.short_description')),
            Field::translated('description', __('admin.field.description'), long: true),

            Field::media('main_media_id', __('admin.field.main_image')),
            Field::media('datasheet_media_id', __('admin.field.datasheet'), __('admin.hint.pdf_only')),

            Field::date('published_at', __('admin.field.published_at'))->listed(),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_featured', __('admin.field.featured'))->listed(),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function rules(?Model $record = null): array
    {
        return [
            ...parent::rules($record),
            // The code is the SKU: two products sharing one would make the
            // catalogue ambiguous to both staff and customers.
            'code' => [
                'required',
                'string',
                'max:64',
                Rule::unique('products', 'code')->ignore($record?->getKey())->withoutTrashed(),
            ],
            'published_at' => ['nullable', 'date'],
        ];
    }

    protected function indexQuery(): Builder
    {
        return Product::query()
            ->with(['category:id,name', 'surface:id,name'])
            ->latest('id');
    }

    protected function searchable(): array
    {
        return ['code', 'name', 'slug'];
    }

    /**
     * @param  class-string<Model>  $model
     * @return array<string, string>
     */
    private function options(string $model): array
    {
        return $model::query()
            ->orderBy('position')
            ->get()
            ->mapWithKeys(fn (Model $m): array => [(string) $m->getKey() => (string) $m->name])
            ->all();
    }

    /**
     * Decors, each labelled with the family it belongs to.
     *
     * The catalogue's only filter is the decor *family*, but a product does not
     * carry one — it carries a decor, and the family comes from that. Choosing
     * "بلوط طبیعی" therefore decides which filter bucket the product lands in,
     * and nothing on the form said so. Naming the family in the option makes
     * the consequence visible at the moment of the choice.
     *
     * @return array<string, string>
     */
    private function decorOptions(): array
    {
        return Decor::query()
            ->orderBy('decor_family')
            ->orderBy('position')
            ->get()
            ->mapWithKeys(fn (Decor $decor): array => [
                (string) $decor->getKey() => $decor->decor_family === null
                    ? (string) $decor->name
                    : $decor->name.' — '.$decor->decor_family->label(),
            ])
            ->all();
    }

    /**
     * @return array<string, string>
     */
    private function thicknessOptions(): array
    {
        return Thickness::query()
            ->orderBy('value_mm')
            ->get()
            ->mapWithKeys(fn (Thickness $t): array => [(string) $t->id => $t->displayLabel()])
            ->all();
    }
}
