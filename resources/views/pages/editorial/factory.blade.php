@php
    use App\Support\Enums\PageSectionType;

    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => $page->title],
    ];

    $features = $page->sectionsOfType(PageSectionType::Feature);

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

    @if ($features->isNotEmpty())
        <x-layout.section>
            <div class="grid gap-10 md:grid-cols-2">
                @foreach ($features as $section)
                    <x-content.feature
                        :heading="$section->heading"
                        :body="$section->body"
                        :media="$section->image"
                    />
                @endforeach
            </div>
        </x-layout.section>
    @endif

    <x-content.cta-band :heading="__('pages.home.cta_heading')" :lead="__('pages.home.cta_lead')">
        <x-ui.button :href="lroute('production-process')" size="lg">{{ __('nav.production_process') }}</x-ui.button>
        <x-ui.button :href="lroute('contact')" size="lg" variant="outline" class="border-white/40 text-text-inverse hover:bg-white/10">
            {{ __('cta.contact_factory') }}
        </x-ui.button>
    </x-content.cta-band>
</x-layouts.app>
