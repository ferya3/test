@php
    $locales = app(App\Services\Localization\LocaleManager::class);
@endphp

<x-layouts.admin :title="__('admin.resources.settings')">
    <form method="POST" action="{{ route('admin.settings.update') }}" class="max-w-3xl">
        @csrf
        @method('PUT')

        @foreach ($groups as $group => $settings)
            <section class="mb-8 rounded-lg border border-border bg-surface p-6">
                <h2 class="mb-5 text-h4">{{ __("admin.settings_group.{$group}") }}</h2>

                <div class="flex flex-col gap-5">
                    @foreach ($settings as $setting)
                        @php $value = $setting->value; @endphp

                        @if (is_array($value))
                            {{-- Translatable setting: one input per locale. --}}
                            <fieldset class="flex flex-col gap-2">
                                <legend class="mb-1 text-body-sm font-medium">{{ $setting->key }}</legend>

                                @foreach ($locales->codes() as $code)
                                    <div class="flex flex-col gap-1.5">
                                        <label for="{{ $setting->key }}-{{ $code }}" class="text-caption text-text-muted">
                                            {{ $locales->nativeName($code) }}
                                        </label>
                                        <input
                                            id="{{ $setting->key }}-{{ $code }}"
                                            type="text"
                                            name="settings[{{ $setting->key }}][{{ $code }}]"
                                            value="{{ $value[$code] ?? '' }}"
                                            dir="{{ $locales->direction($code) }}"
                                            class="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                        >
                                    </div>
                                @endforeach
                            </fieldset>
                        @else
                            <div class="flex flex-col gap-2">
                                <label for="{{ $setting->key }}" class="text-body-sm font-medium">{{ $setting->key }}</label>
                                <input
                                    id="{{ $setting->key }}"
                                    type="text"
                                    name="settings[{{ $setting->key }}]"
                                    value="{{ $value }}"
                                    dir="ltr"
                                    class="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                >
                                @unless ($setting->is_public)
                                    <p class="text-caption text-text-muted">{{ __('admin.hint.private_setting') }}</p>
                                @endunless
                            </div>
                        @endif
                    @endforeach
                </div>
            </section>
        @endforeach

        <x-ui.button type="submit" size="lg">{{ __('admin.save') }}</x-ui.button>
    </form>
</x-layouts.admin>
