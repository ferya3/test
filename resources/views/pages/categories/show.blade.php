@php
    $breadcrumbs = array_values(array_filter([
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.categories'), 'url' => lroute('categories.index')],
        $category->parent
            ? ['label' => $category->parent->name, 'url' => lroute('categories.show', ['category' => $category->parent->slug])]
            : null,
        ['label' => $category->name],
    ]));
@endphp

<x-layouts.app :title="$category->name">
    <x-content.hero
        :media="$category->cover"
        :overline="__('nav.categories')"
        :heading="$category->name"
        :lead="$category->short_description"
        :breadcrumbs="$breadcrumbs"
        size="sm"
    />

    @if ($category->children->isNotEmpty())
        <x-layout.section size="sm" tone="subtle">
            <ul class="flex flex-wrap gap-2">
                @foreach ($category->children as $child)
                    <li>
                        <a
                            href="{{ lroute('categories.show', ['category' => $child->slug]) }}"
                            class="inline-flex rounded-sm border border-border bg-surface-raised px-4 py-2 text-body-sm transition-colors hover:border-border-strong"
                        >{{ $child->name }}</a>
                    </li>
                @endforeach
            </ul>
        </x-layout.section>
    @endif

    <x-layout.section>
        <div class="mb-6 flex items-center justify-between border-b border-border pb-4">
            <p class="text-body-sm text-text-muted">
                {{ __('ui.results_count', ['count' => $products->total()]) }}
            </p>

            <x-ui.button :href="lroute('products.index', ['category' => $category->slug])" variant="link">
                {{ __('ui.filters') }}
            </x-ui.button>
        </div>

        <x-product.grid :products="$products">
            <x-slot:empty>
                <x-ui.empty-state
                    :heading="__('product.empty.heading')"
                    :body="__('product.empty.body')"
                />
            </x-slot:empty>
        </x-product.grid>

        {{ $products->links() }}
    </x-layout.section>

    @if ($category->description)
        <x-layout.section tone="subtle" size="sm">
            <x-content.prose>{!! nl2br(e($category->description)) !!}</x-content.prose>
        </x-layout.section>
    @endif

    <x-product.compare-bar />
</x-layouts.app>
