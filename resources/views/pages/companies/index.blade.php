@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('pages.companies.heading')],
    ];

    // Figures nobody has entered are left out rather than shown as zero.
    $stats = array_values(array_filter([
        ['label' => __('pages.companies.total_companies'), 'value' => (string) $totals['companies'], 'count' => true],
        $totals['employees'] !== null
            ? ['label' => __('pages.companies.total_employees'), 'value' => number_format($totals['employees']), 'unit' => __('units.people'), 'count' => true]
            : null,
        $totals['site_area_sqm'] !== null
            ? ['label' => __('pages.companies.total_area'), 'value' => number_format($totals['site_area_sqm']), 'unit' => __('units.sqm'), 'count' => true]
            : null,
    ]));

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="__('pages.companies.heading')" :seo="$seo">
    <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

    <x-content.hero
        :overline="__('pages.companies.overline')"
        :heading="__('pages.companies.heading')"
        :lead="__('pages.companies.lead')"
        :breadcrumbs="$breadcrumbs"
    />

    @if ($companies->isEmpty())
        <x-layout.section>
            <p class="text-body text-text-muted">{{ __('pages.companies.empty') }}</p>
        </x-layout.section>
    @else
        <x-layout.section size="sm" tone="subtle">
            <x-content.stat-band :stats="$stats" data-motion="stagger" />
        </x-layout.section>

        <x-layout.section>
            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-motion="stagger">
                @foreach ($companies as $company)
                    <li class="flex">
                        <x-company.card :company="$company" :heading-level="2" />
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif
</x-layouts.app>
