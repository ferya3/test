@php
    // Rows are built from the union of every compared product's attributes, so
    // a value missing on one product still shows as a gap rather than shifting
    // the table.
    $rows = [
        ['label' => __('product.code'), 'value' => fn ($p) => $p->code, 'ltr' => true],
        ['label' => __('product.category'), 'value' => fn ($p) => $p->category?->name],
        ['label' => __('product.surface'), 'value' => fn ($p) => $p->surface?->name],
        ['label' => __('product.decor'), 'value' => fn ($p) => $p->decor?->name],
        ['label' => __('product.color'), 'value' => fn ($p) => $p->color?->name],
        ['label' => __('product.material'), 'value' => fn ($p) => $p->material?->name],
        ['label' => __('product.thicknesses'), 'value' => fn ($p) => $p->thicknesses->map->displayLabel()->join('، ')],
        ['label' => __('product.dimensions'), 'value' => fn ($p) => implode('، ', $p->dimensionLabels())],
        ['label' => __('product.applications'), 'value' => fn ($p) => $p->applications->map->name->join('، ')],
    ];
@endphp

<x-layouts.app :title="__('compare.heading')">
    <x-layout.section size="sm" tone="subtle">
        <x-layout.section-header
            :heading="__('compare.heading')"
            :lead="__('compare.lead')"
            :level="1"
        />
    </x-layout.section>

    <x-layout.section>
        @if ($products->isEmpty())
            <x-ui.empty-state
                :heading="__('compare.empty_heading')"
                :body="__('compare.empty_body')"
            >
                <x-slot:actions>
                    <x-ui.button :href="lroute('products.index')">{{ __('cta.view_products') }}</x-ui.button>
                </x-slot:actions>
            </x-ui.empty-state>
        @else
            {{-- The table scrolls inside its own container so the page body never
                 scrolls horizontally on a phone. --}}
            <div class="overflow-x-auto">
                <table class="w-full min-w-[44rem] border-collapse text-body-sm">
                    <caption class="sr-only">{{ __('compare.heading') }}</caption>

                    <thead>
                        <tr>
                            <th scope="col" class="w-40 p-3 text-start"></th>
                            @foreach ($products as $product)
                                <th scope="col" class="p-3 align-top text-start">
                                    <a
                                        href="{{ lroute('products.show', ['product' => $product->slug]) }}"
                                        class="flex flex-col gap-2 rounded-md"
                                    >
                                        <x-media.picture
                                            :media="$product->mainImage"
                                            :alt="$product->name"
                                            ratio="4/3"
                                            sizes="22vw"
                                            class="w-full rounded-md"
                                        />
                                        <span class="text-body font-semibold">{{ $product->name }}</span>
                                    </a>
                                </th>
                            @endforeach
                        </tr>
                    </thead>

                    <tbody>
                        @foreach ($rows as $row)
                            <tr class="border-t border-border">
                                <th scope="row" class="p-3 text-start font-normal text-text-muted">
                                    {{ $row['label'] }}
                                </th>

                                @foreach ($products as $product)
                                    @php $value = ($row['value'])($product); @endphp
                                    <td class="p-3 align-top">
                                        @if (filled($value))
                                            @if (! empty($row['ltr']))
                                                <x-ui.measure :value="$value" dir="ltr" />
                                            @else
                                                {{ $value }}
                                            @endif
                                        @else
                                            <span class="text-text-placeholder">—</span>
                                        @endif
                                    </td>
                                @endforeach
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-layout.section>
</x-layouts.app>
