{{--
    Picks an existing media record by id.

    Deliberately a plain select over the library rather than an inline uploader:
    uploads go through the media library, which is the one place the MIME and
    size checks live. A second upload path would be a second place to get that
    wrong.
--}}
@props(['name', 'label', 'value' => null, 'hint' => null])

@php
    $options = App\Models\Media::query()
        ->latest('id')
        ->limit(200)
        ->get(['id', 'filename', 'collection', 'mime_type']);
@endphp

<div class="flex flex-col gap-2">
    <label for="{{ $name }}" class="text-body-sm font-medium">{{ $label }}</label>

    <div class="flex items-start gap-4">
        <select
            id="{{ $name }}"
            name="{{ $name }}"
            class="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-raised px-3.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
            <option value="">—</option>
            @foreach ($options as $option)
                <option value="{{ $option->id }}" @selected((string) $value === (string) $option->id)>
                    {{ $option->filename }} ({{ $option->collection->label() }})
                </option>
            @endforeach
        </select>

        @if ($value && ($current = App\Models\Media::find($value)) && $current->isImage())
            <x-media.picture
                :media="$current"
                alt=""
                ratio="1/1"
                sizes="64px"
                class="size-16 shrink-0 rounded-md"
            />
        @endif
    </div>

    <p class="text-caption text-text-muted">
        {{ $hint ?? __('admin.hint.media_library') }}
        <a href="{{ route('admin.media.index') }}" class="text-accent-text underline-offset-4 hover:underline">
            {{ __('admin.resources.media') }}
        </a>
    </p>

    @error($name)
        <p role="alert" class="text-caption text-danger-tint-text">{{ $message }}</p>
    @enderror
</div>
