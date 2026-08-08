<x-layouts.admin :title="__('admin.resources.media')">
    @can('create', App\Models\Media::class)
        <form
            method="POST"
            action="{{ route('admin.media.store') }}"
            enctype="multipart/form-data"
            class="mb-8 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-5"
        >
            @csrf

            <div class="flex min-w-56 flex-1 flex-col gap-2">
                <label for="file" class="text-body-sm font-medium">{{ __('admin.field.file') }}</label>
                <input
                    id="file"
                    type="file"
                    name="file"
                    required
                    accept="{{ implode(',', array_keys(config('media.accepted'))) }}"
                    class="text-body-sm file:me-3 file:rounded-md file:border-0 file:bg-surface-inverse file:px-4 file:py-2 file:text-body-sm file:text-text-inverse"
                >
                {{-- The accept attribute is a convenience only; the real check is
                     the detected MIME type in MediaService. --}}
                <p class="text-caption text-text-muted">{{ __('admin.hint.upload') }}</p>
            </div>

            <x-ui.select
                name="collection"
                :label="__('admin.field.collection')"
                :options="collect(App\Support\Enums\MediaCollection::cases())->mapWithKeys(fn ($c) => [$c->value => $c->label()])->all()"
                selected="general"
                class="w-48"
            />

            <x-ui.button type="submit">{{ __('admin.upload') }}</x-ui.button>
        </form>
    @endcan

    <div class="mb-6 flex flex-wrap gap-2">
        <a href="{{ route('admin.media.index') }}"
           @class(['rounded-sm border px-3.5 py-2 text-body-sm',
                   'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeCollection === '',
                   'border-border' => $activeCollection !== ''])
        >{{ __('admin.all') }}</a>
        @foreach ($collections as $collection)
            <a href="{{ route('admin.media.index', ['collection' => $collection->value]) }}"
               @class(['rounded-sm border px-3.5 py-2 text-body-sm',
                       'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeCollection === $collection->value,
                       'border-border' => $activeCollection !== $collection->value])
            >{{ $collection->label() }}</a>
        @endforeach
    </div>

    @if ($media->isEmpty())
        <x-ui.empty-state :heading="__('admin.empty')" />
    @else
        <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            @foreach ($media as $item)
                <li class="overflow-hidden rounded-lg border border-border bg-surface">
                    @if ($item->isImage())
                        <x-media.picture :media="$item" alt="" ratio="1/1" sizes="20vw" class="w-full" />
                    @else
                        <div class="grid aspect-square place-items-center bg-surface-subtle text-text-placeholder">
                            <span class="text-caption uppercase">{{ $item->extension }}</span>
                        </div>
                    @endif

                    <div class="flex flex-col gap-1 p-3">
                        <p class="truncate text-caption" title="{{ $item->filename }}">{{ $item->filename }}</p>
                        <p class="text-caption text-text-muted">{{ $item->humanSize() }}</p>

                        @can('delete', $item)
                            <form
                                method="POST"
                                action="{{ route('admin.media.destroy', $item) }}"
                                x-data
                                x-on:submit="if (! confirm('{{ __('admin.confirm_delete') }}')) $event.preventDefault()"
                            >
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="mt-1 text-caption text-danger-tint-text underline-offset-4 hover:underline">
                                    {{ __('admin.delete') }}
                                </button>
                            </form>
                        @endcan
                    </div>
                </li>
            @endforeach
        </ul>
    @endif

    <div class="mt-6">{{ $media->links() }}</div>
</x-layouts.admin>
