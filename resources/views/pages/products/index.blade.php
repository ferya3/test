@php
    $breadcrumbs = [
        ['label' => __('ui.home'), 'url' => lroute('home')],
        ['label' => __('nav.products')],
    ];
@endphp

<x-layouts.app :title="__('pages.products.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-ui.breadcrumbs :items="$breadcrumbs" class="mb-5" />

        <x-layout.section-header
            :heading="__('pages.products.heading')"
            :lead="__('pages.products.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section size="default">
        {{-- Sidebar on desktop; a disclosure above the grid on mobile, so the
             filter panel never pushes the results off the first screen. --}}
        <div class="grid gap-8 lg:grid-cols-[17rem_1fr] lg:gap-12">
            <div x-data="{ open: false }">
                {{-- Visibility lives on a wrapper: passing display utilities into
                     a component that sets its own would emit conflicting classes. --}}
                <div class="lg:hidden">
                    <x-ui.button
                        variant="outline"
                        full-width
                        x-on:click="open = ! open"
                        x-bind:aria-expanded="open"
                        aria-controls="filter-panel"
                    >
                        {{ __('ui.filters') }}
                        @if ($filters->activeCount() > 0)
                            <x-ui.badge tone="accent" size="sm">{{ $filters->activeCount() }}</x-ui.badge>
                        @endif
                    </x-ui.button>

                    <div id="filter-panel" x-show="open" x-collapse class="mt-4">
                        <x-product.filters :filters="$filters" :facets="$facets" :groups="$filterGroups" />
                    </div>
                </div>

                {{-- Always visible from the large breakpoint up. --}}
                <div class="hidden lg:block">
                    <x-product.filters :filters="$filters" :facets="$facets" :groups="$filterGroups" />
                </div>
            </div>

            <div class="flex flex-col gap-6">
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                    <p class="text-body-sm text-text-muted">
                        {{ __('ui.results_count', ['count' => $products->total()]) }}
                    </p>

                    {{-- Sorting submits with GET, so the current filters travel
                         with it as hidden fields and the URL stays shareable. --}}
                    <form method="GET" action="{{ lroute('products.index') }}" x-data class="flex items-center gap-2">
                        {{-- Carries the current filters through the sort submit so
                             the resulting URL keeps them. Values are already
                             comma-joined strings. --}}
                        @foreach ($filters->toQuery() as $key => $value)
                            @continue($key === 'sort')

                            <input type="hidden" name="{{ $key }}" value="{{ $value }}">
                        @endforeach

                        <label for="sort" class="text-body-sm text-text-muted">{{ __('product.sort') }}</label>

                        {{-- x-on rather than an inline onchange handler: an inline
                             event handler would force script-src 'unsafe-inline',
                             which defeats the per-request nonce. --}}
                        <select
                            id="sort"
                            name="sort"
                            x-on:change="$el.form.requestSubmit()"
                            class="h-10 rounded-md border border-border-strong bg-surface-raised ps-3 pe-9 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            @foreach (App\Support\Data\ProductFilters::SORTS as $option)
                                <option value="{{ $option }}" @selected($filters->sort === $option)>
                                    {{ __("product.sort_option.{$option}") }}
                                </option>
                            @endforeach
                        </select>

                        {{-- Submits the form when JavaScript is unavailable. --}}
                        <noscript>
                            <button type="submit" class="h-10 rounded-md border border-border-strong px-3 text-body-sm">
                                {{ __('product.sort') }}
                            </button>
                        </noscript>
                    </form>
                </div>

                <x-product.grid :products="$products">
                    <x-slot:empty>
                        <x-ui.empty-state
                            :heading="__('product.empty.heading')"
                            :body="__('product.empty.body')"
                        >
                            <x-slot:actions>
                                <x-ui.button :href="lroute('products.index')" variant="outline">
                                    {{ __('ui.clear_filters') }}
                                </x-ui.button>
                            </x-slot:actions>
                        </x-ui.empty-state>
                    </x-slot:empty>
                </x-product.grid>

                {{ $products->links() }}
            </div>
        </div>
    </x-layout.section>

    <x-product.compare-bar />
</x-layouts.app>
