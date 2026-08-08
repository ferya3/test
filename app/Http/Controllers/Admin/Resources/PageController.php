<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Admin\CrudController;
use App\Models\Page;
use App\Support\Admin\Field;
use App\Support\Enums\PageTemplate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;

/**
 * Editorial pages.
 *
 * Page-level content only. The ordered `page_sections` that make up the body of
 * the About, Factory, Process and Quality pages are seeded structure rather than
 * free-form content, and are not editable here — see docs/ARCHITECTURE.md.
 */
class PageController extends CrudController
{
    protected function model(): string
    {
        return Page::class;
    }

    protected function resource(): string
    {
        return 'pages';
    }

    protected function title(): string
    {
        return __('admin.resources.pages');
    }

    protected function fields(): array
    {
        return [
            Field::translated('title', __('admin.field.title'), required: true)->listed(),
            Field::text('slug', __('admin.field.slug'))->readOnly(),
            Field::enum('template', __('admin.field.template'), PageTemplate::class, required: true)->listed(),
            Field::translated('subtitle', __('admin.field.subtitle')),
            Field::translated('body', __('admin.field.body'), long: true),
            Field::media('hero_media_id', __('admin.field.hero')),
            Field::number('position', __('admin.field.position')),
            Field::checkbox('is_active', __('admin.field.active'))->listed(),
        ];
    }

    protected function indexQuery(): Builder
    {
        return Page::query()->orderBy('position')->orderBy('id');
    }

    protected function searchable(): array
    {
        return ['title', 'slug'];
    }

    /**
     * Pages are structural: each one backs a fixed route, so deleting one would
     * turn a linked page into a 404. Creation is likewise not offered.
     */
    public function create(): never
    {
        abort(404);
    }

    public function destroy(string|int $id): RedirectResponse
    {
        abort(404);
    }
}
