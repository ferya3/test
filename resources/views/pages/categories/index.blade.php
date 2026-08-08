@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.categories')],
    ];
@endphp

<x-layouts.app :title="__('pages.categories.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />
        <x-layout.section-header
            :heading="__('pages.categories.heading')"
            :lead="__('pages.categories.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        <ul class="grid gap-6 md:grid-cols-2">
            @foreach ($categories as $index => $category)
                <li>
                    <x-ui.card padding="none" class="h-full overflow-hidden">
                        <x-media.picture
                            :media="$category->cover"
                            :alt="$category->name"
                            ratio="16/9"
                            :priority="$index < 2"
                            sizes="(min-width: 768px) 46vw, 92vw"
                            class="w-full"
                        />

                        <div class="flex flex-1 flex-col gap-3 p-6">
                            <div class="flex items-start justify-between gap-3">
                                <h2 class="text-h3">
                                    <a
                                        href="{{ lroute('categories.show', ['category' => $category->slug]) }}"
                                        class="rounded-xs underline-offset-4 hover:underline"
                                    >{{ $category->name }}</a>
                                </h2>

                                <x-ui.badge>
                                    {{ __('pages.categories.product_count', ['count' => $category->products_count]) }}
                                </x-ui.badge>
                            </div>

                            @if ($category->short_description)
                                <p class="text-body text-text-secondary">{{ $category->short_description }}</p>
                            @endif

                            @if ($category->children->isNotEmpty())
                                <ul class="mt-2 flex flex-wrap gap-2">
                                    @foreach ($category->children as $child)
                                        <li>
                                            <a
                                                href="{{ lroute('categories.show', ['category' => $child->slug]) }}"
                                                class="inline-flex rounded-sm border border-border px-3 py-1.5 text-body-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text"
                                            >{{ $child->name }}</a>
                                        </li>
                                    @endforeach
                                </ul>
                            @endif
                        </div>
                    </x-ui.card>
                </li>
            @endforeach
        </ul>
    </x-layout.section>
</x-layouts.app>
