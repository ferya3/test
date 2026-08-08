<x-layouts.app :title="__('pages.search.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-layout.section-header
            :heading="__('pages.search.heading')"
            :lead="__('pages.search.lead')"
            :level="1"
            class="mb-6"
        />

        <form method="GET" action="{{ lroute('search') }}" role="search" class="flex max-w-xl gap-3">
            <x-ui.input
                name="q"
                type="search"
                :label="__('ui.search_products')"
                :value="$filters->search"
                :placeholder="__('pages.search.placeholder')"
                class="flex-1"
            />

            <x-ui.button type="submit" class="mt-8 self-start">{{ __('ui.search') }}</x-ui.button>
        </form>
    </x-layout.section>

    <x-layout.section>
        @if ($products === null)
            <x-ui.empty-state :heading="__('pages.search.prompt')" />
        @else
            <p class="mb-6 text-body-sm text-text-muted">
                {{ __('pages.search.results_for', ['term' => $filters->search]) }}
                — {{ __('ui.results_count', ['count' => $products->total()]) }}
            </p>

            <x-product.grid :products="$products">
                <x-slot:empty>
                    <x-ui.empty-state
                        :heading="__('product.empty.heading')"
                        :body="__('product.empty.body')"
                    />
                </x-slot:empty>
            </x-product.grid>

            {{ $products->links() }}
        @endif
    </x-layout.section>
</x-layouts.app>
