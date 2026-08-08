@php
    $locales = app(App\Services\Localization\LocaleManager::class);
    $isNew = ! $record->exists;
    $action = $isNew
        ? route('admin.'.$resource.'.store')
        : route('admin.'.$resource.'.update', $record);
@endphp

<x-layouts.admin :title="$title">
    <div class="mb-6">
        <a href="{{ route('admin.'.$resource.'.index') }}" class="text-body-sm text-accent-text underline-offset-4 hover:underline">
            ← {{ $title }}
        </a>
    </div>

    <form method="POST" action="{{ $action }}" class="max-w-3xl">
        @csrf
        @unless ($isNew)
            @method('PUT')
        @endunless

        <div class="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6">
            @foreach ($fields as $field)
                @php
                    // old() first so a failed submission does not discard what
                    // the editor typed.
                    $current = old($field->name, $record->{$field->name} ?? null);
                @endphp

                @switch($field->type)
                    @case('translated')
                    @case('translated-area')
                        <fieldset class="flex flex-col gap-3">
                            <legend class="mb-1 flex items-center gap-1.5 text-body-sm font-medium">
                                {{ $field->label }}
                                @if ($field->required)
                                    <span aria-hidden="true" class="text-danger-tint-text">*</span>
                                @endif
                            </legend>

                            @foreach ($locales->codes() as $code)
                                @php
                                    $translations = old($field->name, $record->exists ? $record->getTranslations($field->name) : []);
                                    $value = is_array($translations) ? ($translations[$code] ?? '') : '';
                                @endphp

                                <div class="flex flex-col gap-1.5">
                                    <label for="{{ $field->name }}-{{ $code }}" class="text-caption text-text-muted">
                                        {{ $locales->nativeName($code) }}
                                    </label>

                                    @if ($field->type === 'translated-area')
                                        <textarea
                                            id="{{ $field->name }}-{{ $code }}"
                                            name="{{ $field->name }}[{{ $code }}]"
                                            rows="6"
                                            dir="{{ $locales->direction($code) }}"
                                            class="w-full resize-y rounded-md border border-border-strong bg-surface-raised px-3.5 py-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >{{ $value }}</textarea>
                                    @else
                                        <input
                                            id="{{ $field->name }}-{{ $code }}"
                                            type="text"
                                            name="{{ $field->name }}[{{ $code }}]"
                                            value="{{ $value }}"
                                            dir="{{ $locales->direction($code) }}"
                                            class="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >
                                    @endif
                                </div>
                            @endforeach

                            @error($field->name)
                                <p role="alert" class="text-caption text-danger-tint-text">{{ $message }}</p>
                            @enderror
                        </fieldset>
                        @break

                    @case('select')
                        @php
                            // optionKey rather than a cast: an enum-cast column
                            // hands back an instance, which cannot be stringified.
                            $selected = $field->multiple
                                ? (array) old($field->name, $record->exists && $field->relation
                                    ? $record->{$field->relation}->pluck('id')->all()
                                    : [])
                                : [$field->optionKey($current)];
                        @endphp

                        <div class="flex flex-col gap-2">
                            <label for="{{ $field->name }}" class="text-body-sm font-medium">
                                {{ $field->label }}
                                @if ($field->required)<span aria-hidden="true" class="text-danger-tint-text">*</span>@endif
                            </label>

                            <select
                                id="{{ $field->name }}"
                                name="{{ $field->name }}{{ $field->multiple ? '[]' : '' }}"
                                @if ($field->multiple) multiple size="6" @endif
                                class="w-full rounded-md border border-border-strong bg-surface-raised px-3.5 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                @unless ($field->multiple)
                                    <option value="">—</option>
                                @endunless

                                @foreach ($field->options as $value => $label)
                                    <option value="{{ $value }}" @selected(in_array((string) $value, array_map('strval', $selected), true))>
                                        {{ $label }}
                                    </option>
                                @endforeach
                            </select>

                            @if ($field->hint)
                                <p class="text-caption text-text-muted">{{ $field->hint }}</p>
                            @endif

                            @error($field->name)
                                <p role="alert" class="text-caption text-danger-tint-text">{{ $message }}</p>
                            @enderror
                        </div>
                        @break

                    @case('checkbox')
                        <div>
                            {{-- Hidden field first so an unchecked box submits a
                                 value; otherwise unchecking would be ignored. --}}
                            <input type="hidden" name="{{ $field->name }}" value="0">
                            <x-ui.checkbox
                                :name="$field->name"
                                :label="$field->label"
                                value="1"
                                :checked="(bool) $current"
                                :hint="$field->hint"
                            />
                        </div>
                        @break

                    @case('media')
                        <x-admin.media-picker
                            :name="$field->name"
                            :label="$field->label"
                            :value="$current"
                            :hint="$field->hint"
                        />
                        @break

                    @case('textarea')
                        <x-ui.textarea :name="$field->name" :label="$field->label" :value="$current" :hint="$field->hint" />
                        @break

                    @default
                        <x-ui.input
                            :name="$field->name"
                            :label="$field->label"
                            :type="$field->type === 'number' ? 'number' : ($field->type === 'date' ? 'date' : 'text')"
                            :value="$field->type === 'date' && $current ? \Illuminate\Support\Carbon::parse($current)->format('Y-m-d') : $current"
                            :hint="$field->hint"
                            :required="$field->required"
                        />
                @endswitch
            @endforeach
        </div>

        <div class="mt-6 flex gap-3">
            <x-ui.button type="submit" size="lg">{{ __('admin.save') }}</x-ui.button>
            <x-ui.button :href="route('admin.'.$resource.'.index')" variant="ghost" size="lg">
                {{ __('admin.cancel') }}
            </x-ui.button>
        </div>
    </form>
</x-layouts.admin>
