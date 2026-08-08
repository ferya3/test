@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.colors_and_decor')],
    ];

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="__('pages.colors.heading')" :seo="$seo">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />
        <x-layout.section-header
            :heading="__('pages.colors.heading')"
            :lead="__('pages.colors.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <h2 class="mb-8 text-h3">{{ __('pages.colors.colors_heading') }}</h2>

        @foreach ($colorFamilies as $family => $colors)
            <section class="mb-12 last:mb-0">
                <h3 class="mb-4 text-overline uppercase text-text-muted">
                    {{ $family === 'other' ? __('enums.color_family.neutral') : __("enums.color_family.{$family}") }}
                </h3>

                <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    @foreach ($colors as $color)
                        <li>
                            <a
                                href="{{ lroute('products.index', ['color' => $color->slug]) }}"
                                class="group flex flex-col gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                @if ($color->swatch)
                                    <x-media.picture
                                        :media="$color->swatch"
                                        :alt="$color->name"
                                        ratio="1/1"
                                        sizes="(min-width: 1024px) 15vw, 45vw"
                                        class="w-full rounded-md"
                                    />
                                @else
                                    {{-- Swatch colour comes from the database, so it
                                         cannot be a Tailwind class. --}}
                                    <span
                                        aria-hidden="true"
                                        class="block aspect-square w-full rounded-md border border-border transition-transform group-hover:-translate-y-0.5"
                                        style="background-color: {{ $color->hex ?? 'transparent' }}"
                                    ></span>
                                @endif

                                <span class="text-body-sm font-medium">{{ $color->name }}</span>

                                @if ($color->hex)
                                    <x-ui.measure :value="strtoupper($color->hex)" dir="ltr" class="text-caption text-text-muted" />
                                @endif
                            </a>
                        </li>
                    @endforeach
                </ul>
            </section>
        @endforeach
    </x-layout.section>

    <x-layout.section tone="subtle">
        <h2 class="mb-8 text-h3">{{ __('pages.colors.decors_heading') }}</h2>

        @foreach ($decorFamilies as $family => $decors)
            <section class="mb-12 last:mb-0">
                <h3 class="mb-4 text-overline uppercase text-text-muted">
                    {{ $family === 'other' ? __('enums.decor_family.solid') : __("enums.decor_family.{$family}") }}
                </h3>

                <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    @foreach ($decors as $decor)
                        <li>
                            <a
                                href="{{ lroute('products.index', ['decor' => $decor->slug]) }}"
                                class="group flex flex-col gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <x-media.picture
                                    :media="$decor->sample"
                                    :alt="$decor->name"
                                    ratio="4/3"
                                    sizes="(min-width: 1024px) 22vw, 45vw"
                                    class="w-full rounded-md"
                                />

                                <span class="text-body-sm font-medium">{{ $decor->name }}</span>

                                @if ($decor->code)
                                    <x-ui.measure :value="$decor->code" dir="ltr" class="text-caption text-text-muted" />
                                @endif
                            </a>
                        </li>
                    @endforeach
                </ul>
            </section>
        @endforeach

        <x-ui.alert tone="info" class="mt-10">{{ __('pages.colors.disclaimer') }}</x-ui.alert>
    </x-layout.section>

    <x-content.cta-band :heading="__('pages.home.cta_heading')" :lead="__('pages.home.cta_lead')">
        <x-ui.button :href="lroute('contact', ['type' => 'sample'])" size="lg">
            {{ __('cta.request_sample') }}
        </x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
