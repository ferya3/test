@php
    use App\Support\Enums\PageSectionType;

    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => $page->title],
    ];

    $texts = $page->sectionsOfType(PageSectionType::Text);
    $steps = $page->sectionsOfType(PageSectionType::Step);
@endphp

<x-layouts.app :title="$page->title">
    <x-content.hero
        :media="$page->hero"
        :overline="__('nav.factory')"
        :heading="$page->title"
        :lead="$page->subtitle"
        :breadcrumbs="$breadcrumbs"
    />

    @foreach ($texts as $section)
        <x-layout.section size="sm">
            <h2 class="mb-4 text-h2">{{ $section->heading }}</h2>
            <x-content.prose>{!! nl2br(e($section->body)) !!}</x-content.prose>
        </x-layout.section>
    @endforeach

    @if ($steps->isNotEmpty())
        <x-layout.section tone="subtle">
            <x-layout.section-header :heading="__('nav.quality_control')" class="mb-10" />

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

    @if ($certificates->isNotEmpty())
        <x-layout.section>
            <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
                <x-layout.section-header :heading="__('nav.certificates')" />
                <x-ui.button :href="lroute('certificates')" variant="outline">{{ __('cta.view_all') }}</x-ui.button>
            </div>

            <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                @foreach ($certificates as $certificate)
                    <li>
                        <x-ui.card padding="none" class="h-full overflow-hidden">
                            <x-media.picture
                                :media="$certificate->image"
                                :alt="$certificate->title"
                                ratio="3/4"
                                sizes="(min-width: 1024px) 22vw, 45vw"
                                class="w-full"
                            />
                            <div class="p-4">
                                <h3 class="text-body-sm font-semibold">{{ $certificate->title }}</h3>
                            </div>
                        </x-ui.card>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif
</x-layouts.app>
