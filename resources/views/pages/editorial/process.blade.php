@php
    use App\Support\Enums\PageSectionType;

    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => $page->title],
    ];

    $steps = $page->sectionsOfType(PageSectionType::Step);

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
        <x-layout.section size="sm">
            <x-content.prose>{!! nl2br(e($page->body)) !!}</x-content.prose>
        </x-layout.section>
    @endif

    @if ($steps->isNotEmpty())
        <x-layout.section>
            <ol class="flex flex-col">
                @foreach ($steps as $index => $section)
                    <x-content.step
                        :number="$section->payload('step', $index + 1)"
                        :heading="$section->heading"
                        :body="$section->body"
                        :media="$section->image"
                        class="group"
                    />
                @endforeach
            </ol>
        </x-layout.section>
    @endif

    <x-content.cta-band :heading="__('pages.home.cta_heading')" :lead="__('pages.home.cta_lead')">
        <x-ui.button :href="lroute('quality-control')" size="lg">{{ __('nav.quality_control') }}</x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
