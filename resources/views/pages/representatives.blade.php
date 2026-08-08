@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.representatives')],
    ];

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="__('pages.representatives.heading')" :seo="$seo">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />
        <x-layout.section-header
            :heading="__('pages.representatives.heading')"
            :lead="__('pages.representatives.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <ul class="mb-8 flex flex-wrap gap-2 border-b border-border pb-6">
            <li>
                <a href="{{ lroute('representatives') }}"
                   @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                           'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeProvince === null,
                           'border-border hover:border-border-strong' => $activeProvince !== null])
                >{{ __('pages.representatives.all_provinces') }}</a>
            </li>
            @foreach ($provinces as $province)
                <li>
                    <a href="{{ lroute('representatives', ['province' => $province]) }}"
                       @class(['inline-flex rounded-sm border px-4 py-2 text-body-sm transition-colors',
                               'border-accent-surface bg-accent-tint text-accent-tint-text' => $activeProvince === $province,
                               'border-border hover:border-border-strong' => $activeProvince !== $province])
                    >{{ $province }}</a>
                </li>
            @endforeach
        </ul>

        @if ($representatives->isEmpty())
            <x-ui.empty-state :heading="__('pages.representatives.empty')" />
        @else
            @foreach ($representatives as $province => $group)
                <section class="mb-12 last:mb-0">
                    <h2 class="mb-4 text-h3">{{ $province }}</h2>

                    <ul class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        @foreach ($group as $representative)
                            <li>
                                <x-ui.card class="h-full">
                                    <h3 class="text-h4">{{ $representative->name }}</h3>

                                    @if ($representative->company)
                                        <p class="mt-1 text-body-sm text-text-muted">{{ $representative->company }}</p>
                                    @endif

                                    <dl class="mt-4 flex flex-col gap-2.5 text-body-sm">
                                        @if ($representative->address)
                                            <div>
                                                <dt class="text-caption text-text-muted">{{ __('pages.representatives.address') }}</dt>
                                                <dd>{{ $representative->city }}، {{ $representative->address }}</dd>
                                            </div>
                                        @endif

                                        <div>
                                            <dt class="text-caption text-text-muted">{{ __('pages.representatives.phone') }}</dt>
                                            <dd>
                                                {{-- tel: links must carry the unformatted number. --}}
                                                <a
                                                    href="tel:{{ preg_replace('/\s+/', '', $representative->phone) }}"
                                                    class="rounded-xs underline-offset-4 hover:underline"
                                                >
                                                    <x-ui.measure :value="$representative->phone" dir="ltr" />
                                                </a>
                                            </dd>
                                        </div>

                                        @if ($representative->mobile)
                                            <div>
                                                <dt class="text-caption text-text-muted">{{ __('pages.representatives.mobile') }}</dt>
                                                <dd>
                                                    <a
                                                        href="tel:{{ preg_replace('/\s+/', '', $representative->mobile) }}"
                                                        class="rounded-xs underline-offset-4 hover:underline"
                                                    >
                                                        <x-ui.measure :value="$representative->mobile" dir="ltr" />
                                                    </a>
                                                </dd>
                                            </div>
                                        @endif

                                        @if ($representative->email)
                                            <div>
                                                <dt class="text-caption text-text-muted">{{ __('pages.representatives.email') }}</dt>
                                                <dd>
                                                    <a
                                                        href="mailto:{{ $representative->email }}"
                                                        class="rounded-xs underline-offset-4 hover:underline"
                                                    >
                                                        <x-ui.measure :value="$representative->email" dir="ltr" :tabular="false" />
                                                    </a>
                                                </dd>
                                            </div>
                                        @endif
                                    </dl>

                                    @if ($representative->hasCoordinates())
                                        <a
                                            href="https://www.openstreetmap.org/?mlat={{ $representative->latitude }}&mlon={{ $representative->longitude }}#map=16/{{ $representative->latitude }}/{{ $representative->longitude }}"
                                            rel="noopener noreferrer"
                                            target="_blank"
                                            class="mt-4 inline-flex items-center gap-1.5 rounded-xs text-body-sm text-accent-text underline-offset-4 hover:underline"
                                        >
                                            {{ __('pages.representatives.view_on_map') }}
                                            <svg class="size-3.5 rtl:-scale-x-100" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                                <path d="M6 3h7v7M13 3 5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                            </svg>
                                        </a>
                                    @endif
                                </x-ui.card>
                            </li>
                        @endforeach
                    </ul>
                </section>
            @endforeach
        @endif
    </x-layout.section>

    <x-content.cta-band
        :heading="__('cta.request_representation')"
        :lead="__('pages.contact.lead')"
    >
        <x-ui.button :href="lroute('contact', ['type' => 'representation'])" size="lg">
            {{ __('cta.request_representation') }}
        </x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
