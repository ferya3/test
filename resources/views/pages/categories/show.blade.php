@php
    $breadcrumbs = array_values(array_filter([
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.categories'), 'url' => lroute('categories.index')],
        $category->parent
            ? ['label' => $category->parent->name, 'url' => lroute('categories.show', ['category' => $category->parent->slug])]
            : null,
        ['label' => $category->name],
    ]));

    $schema = app(\App\Services\Seo\SchemaGenerator::class);
@endphp

<x-layouts.app :title="$category->name" :seo="$seo">
    <x-seo.schema :data="$schema->graph([$schema->breadcrumbs($breadcrumbs)])" />

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
        {{--
            The filter bar sits above the grid rather than beside it. With one
            or two questions to ask, a sidebar spent a quarter of every wide
            screen on a column that was mostly empty — and that width is worth
            more as a fourth product per row.
        --}}
        <x-product.filters
            :filters="$filters"
            :facets="$facets"
            :groups="$filterGroups"
            :route="lroute('categories.show', ['category' => $category->slug])"
            :summary="__('ui.results_count', ['count' => $products->total()])"
        />

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
