@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.catalog')],
    ];
@endphp

<x-layouts.app :title="__('pages.catalog.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-layout.section-header
            :heading="__('pages.catalog.heading')"
            :lead="__('pages.catalog.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        @if ($errors->any())
            <x-ui.alert tone="danger" class="mb-8">
                <ul class="list-inside list-disc">
                    @foreach ($errors->all() as $error)
                        <li>{{ $error }}</li>
                    @endforeach
                </ul>
            </x-ui.alert>
        @endif

        <ul class="grid gap-8 lg:grid-cols-2">
            @foreach ($catalogs as $index => $catalog)
                <li>
                    <x-ui.card padding="none" class="h-full overflow-hidden">
                        <div class="grid gap-6 sm:grid-cols-[12rem_1fr]">
                            <x-media.picture
                                :media="$catalog->cover"
                                :alt="$catalog->title"
                                ratio="3/4"
                                :priority="$index < 2"
                                sizes="12rem"
                                class="w-full"
                            />

                            <div class="flex flex-col gap-3 p-6 sm:ps-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    @if ($catalog->version)
                                        <x-ui.badge size="sm">
                                            {{ __('pages.catalog.version') }}
                                            <x-ui.measure :value="$catalog->version" dir="ltr" />
                                        </x-ui.badge>
                                    @endif

                                    @if ($catalog->requires_registration)
                                        <x-ui.badge tone="accent" size="sm">{{ __('cta.download_catalog') }}</x-ui.badge>
                                    @endif
                                </div>

                                <h2 class="text-h4">{{ $catalog->title }}</h2>

                                @if ($catalog->description)
                                    <p class="text-body-sm text-text-muted">{{ $catalog->description }}</p>
                                @endif

                                @if (! $catalog->isDownloadable())
                                    <p class="mt-auto text-body-sm text-text-placeholder">
                                        {{ __('ui.no_results') }}
                                    </p>
                                @elseif (! $catalog->requires_registration)
                                    <x-ui.button
                                        :href="lroute('catalog.download', ['catalog' => $catalog->slug])"
                                        class="mt-auto self-start"
                                    >{{ __('pages.catalog.download') }}</x-ui.button>
                                @else
                                    {{-- Gated: the lead form releases the file for this
                                         session only, so the download URL cannot be
                                         shared around the form. --}}
                                    <details class="group mt-auto">
                                        <summary class="inline-flex h-11 cursor-pointer list-none items-center rounded-md bg-accent-surface px-6 text-body-sm font-semibold text-text-on-accent transition-colors marker:hidden hover:bg-accent-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                                            {{ __('cta.download_catalog') }}
                                        </summary>

                                        <div class="mt-5 border-t border-border pt-5">
                                            <p class="mb-4 text-body-sm text-text-muted">
                                                {{ __('pages.catalog.gated_note') }}
                                            </p>

                                            <form
                                                method="POST"
                                                action="{{ lroute('catalog.request', ['catalog' => $catalog->slug]) }}"
                                                class="grid gap-4 sm:grid-cols-2"
                                            >
                                                @csrf

                                                <div class="hidden" aria-hidden="true">
                                                    <label for="website-{{ $catalog->id }}">Website</label>
                                                    <input id="website-{{ $catalog->id }}" type="text" name="website" tabindex="-1" autocomplete="off">
                                                </div>

                                                <x-ui.input :name="'name'" :id="'name-'.$catalog->id" :label="__('contact.field.name')" required autocomplete="name" />
                                                <x-ui.input :name="'company'" :id="'company-'.$catalog->id" :label="__('contact.field.company')" optional-label autocomplete="organization" />
                                                <x-ui.input :name="'phone'" :id="'phone-'.$catalog->id" type="tel" :label="__('contact.field.phone')" required autocomplete="tel" inputmode="tel" />
                                                <x-ui.input :name="'email'" :id="'email-'.$catalog->id" type="email" :label="__('contact.field.email')" optional-label autocomplete="email" />

                                                <div class="sm:col-span-2">
                                                    <x-ui.button type="submit">{{ __('pages.catalog.download') }}</x-ui.button>
                                                </div>
                                            </form>
                                        </div>
                                    </details>
                                @endif
                            </div>
                        </div>
                    </x-ui.card>
                </li>
            @endforeach
        </ul>
    </x-layout.section>
</x-layouts.app>
