<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Admin\Field;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Generic CRUD for the CMS-style admin resources.
 *
 * Every resource declares its fields once (see App\Support\Admin\Field) and the
 * generic index and form views render them. Authorisation, validation and the
 * relation sync all derive from that one declaration, which closes the usual
 * gap where a field is added to a form but forgotten in the validation rules.
 *
 * A resource with genuinely different needs overrides whatever it must; this is
 * a starting point, not a straitjacket.
 */
abstract class CrudController extends Controller
{
    /**
     * @return class-string<Model>
     */
    abstract protected function model(): string;

    /**
     * Route name segment and permission resource key, e.g. 'products'.
     */
    abstract protected function resource(): string;

    /**
     * @return list<Field>
     */
    abstract protected function fields(): array;

    abstract protected function title(): string;

    public function index(Request $request): View
    {
        $this->authorize('viewAny', $this->model());

        $records = $this->indexQuery()
            ->when(
                $request->filled('q'),
                fn (Builder $query) => $this->applySearch($query, (string) $request->string('q')),
            )
            ->paginate(25)
            ->withQueryString();

        return view('admin.resources.index', [
            'records' => $records,
            'fields' => array_values(array_filter($this->fields(), fn (Field $f): bool => $f->inIndex)),
            'resource' => $this->resource(),
            'title' => $this->title(),
            'searchable' => $this->searchable() !== [],
        ]);
    }

    public function create(): View
    {
        $this->authorize('create', $this->model());

        $model = $this->model();

        return view('admin.resources.form', [
            'record' => new $model,
            'fields' => $this->formFields(),
            'resource' => $this->resource(),
            'title' => $this->title(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', $this->model());

        $validated = $request->validate($this->rules());
        $model = $this->model();

        $record = DB::transaction(function () use ($model, $validated): Model {
            $record = new $model;
            $record->fill($this->attributesFrom($validated));
            $record->save();

            $this->syncRelations($record, $validated);

            return $record;
        });

        return redirect()
            ->route("admin.{$this->resource()}.edit", $record)
            ->with('status', __('admin.saved'));
    }

    public function edit(Request $request, string|int $id): View
    {
        $record = $this->findOrFail($id);

        $this->authorize('update', $record);

        return view('admin.resources.form', [
            'record' => $record,
            'fields' => $this->formFields(),
            'resource' => $this->resource(),
            'title' => $this->title(),
        ]);
    }

    public function update(Request $request, string|int $id): RedirectResponse
    {
        $record = $this->findOrFail($id);

        $this->authorize('update', $record);

        $validated = $request->validate($this->rules($record));

        DB::transaction(function () use ($record, $validated): void {
            $record->fill($this->attributesFrom($validated));
            $record->save();

            $this->syncRelations($record, $validated);
        });

        return redirect()
            ->route("admin.{$this->resource()}.edit", $record)
            ->with('status', __('admin.saved'));
    }

    public function destroy(string|int $id): RedirectResponse
    {
        $record = $this->findOrFail($id);

        $this->authorize('delete', $record);

        $record->delete();

        return redirect()
            ->route("admin.{$this->resource()}.index")
            ->with('status', __('admin.deleted'));
    }

    // -----------------------------------------------------------------
    // Hooks
    // -----------------------------------------------------------------

    protected function indexQuery(): Builder
    {
        return $this->model()::query()->latest('id');
    }

    /**
     * Columns a text search looks at. Translated columns are matched on their
     * raw JSON, which covers every locale at once.
     *
     * @return list<string>
     */
    protected function searchable(): array
    {
        return [];
    }

    /**
     * Validation rules, assembled from the field declarations.
     *
     * @return array<string, mixed>
     */
    protected function rules(?Model $record = null): array
    {
        $rules = [];

        foreach ($this->formFields() as $field) {
            if ($field->isTranslated()) {
                $rules[$field->name] = $field->rules;
                // Each locale value is a string, whatever the outer rule says.
                $rules["{$field->name}.*"] = ['nullable', 'string', 'max:20000'];

                continue;
            }

            $rules[$field->multiple ? "{$field->name}" : $field->name] = $field->rules;

            if ($field->multiple) {
                $rules["{$field->name}.*"] = ['integer'];
            }
        }

        return $rules;
    }

    /**
     * @return list<Field>
     */
    protected function formFields(): array
    {
        return array_values(array_filter($this->fields(), fn (Field $f): bool => $f->inForm));
    }

    /**
     * Only non-relation fields are mass assigned; relations are synced
     * explicitly so a crafted payload cannot write through a relationship.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    protected function attributesFrom(array $validated): array
    {
        $attributes = [];

        foreach ($this->formFields() as $field) {
            if ($field->relation !== null) {
                continue;
            }

            if ($field->type === 'checkbox') {
                $attributes[$field->name] = (bool) ($validated[$field->name] ?? false);

                continue;
            }

            if (array_key_exists($field->name, $validated)) {
                $attributes[$field->name] = $validated[$field->name];
            }
        }

        return $attributes;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    protected function syncRelations(Model $record, array $validated): void
    {
        foreach ($this->formFields() as $field) {
            if ($field->relation === null || ! array_key_exists($field->name, $validated)) {
                continue;
            }

            $record->{$field->relation}()->sync(array_map('intval', (array) $validated[$field->name]));
        }
    }

    protected function applySearch(Builder $query, string $term): Builder
    {
        $columns = $this->searchable();

        if ($columns === []) {
            return $query;
        }

        $escaped = addcslashes($term, '%_\\');

        return $query->where(function (Builder $query) use ($columns, $escaped): void {
            foreach ($columns as $column) {
                $query->orWhere($column, 'like', "%{$escaped}%");
            }
        });
    }

    protected function findOrFail(string|int $id): Model
    {
        return $this->model()::query()->findOrFail($id);
    }
}
