@php
    use App\Support\Enums\PageSectionType;

    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => $page->title],
    ];

    $stats = $page->sectionsOfType(PageSectionType::Stat)
        ->map(fn ($section): array => [
            'value' => (string) $section->payload('value'),
            'label' => $section->heading,
            'unit' => $section->translatedPayload(app()->getLocale() === 'fa' ? 'unit_fa' : 'unit_en'),
        ])
        ->all();

    $timeline = $page->sectionsOfType(PageSectionType::Timeline)
        ->map(fn ($section): array => ['heading' => $section->heading, 'body' => $section->body])
        ->all();

    $texts = $page->sectionsOfType(PageSectionType::Text);

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="$page->title" :seo="$seo">
    <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

    <x-content.hero
        :media="$page->hero"
        :overline="__('nav.factory')"
        :heading="$page->title"
        :lead="$page->subtitle"
        :breadcrumbs="$breadcrumbs"
    />

    @if ($page->body)
        <x-layout.section>
            <x-content.prose>{!! nl2br(e($page->body)) !!}</x-content.prose>
        </x-layout.section>
    @endif

    @if ($stats !== [])
        <x-layout.section size="sm" tone="subtle">
            <x-content.stat-band :stats="$stats" />
        </x-layout.section>
    @endif

    @foreach ($texts as $section)
        <x-layout.section size="sm">
            <h2 class="mb-4 text-h2">{{ $section->heading }}</h2>
            <x-content.prose>{!! nl2br(e($section->body)) !!}</x-content.prose>
        </x-layout.section>
    @endforeach

    @if ($timeline !== [])
        <x-layout.section tone="subtle">
            <x-layout.section-header :heading="__('nav.about')" class="mb-10" />
            <x-content.timeline :entries="$timeline" />
        </x-layout.section>
    @endif

    <x-content.cta-band :heading="__('pages.home.cta_heading')" :lead="__('pages.home.cta_lead')">
        <x-ui.button :href="lroute('contact')" size="lg">{{ __('cta.contact_factory') }}</x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
