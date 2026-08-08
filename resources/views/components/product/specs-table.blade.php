@props([
    'product',
])

@php
    $groups = $product->groupedSpecifications();

    $groupLabels = [
        'physical' => __('product.spec_group.physical'),
        'surface' => __('product.spec_group.surface'),
        'compliance' => __('product.spec_group.compliance'),
        '' => __('product.spec_group.general'),
    ];
@endphp

<div {{ $attributes->class(['flex flex-col gap-8']) }}>
    @foreach ($groups as $group => $specifications)
        <section>
            <h3 class="mb-3 text-overline uppercase text-text-muted">
                {{ $groupLabels[$group] ?? $group }}
            </h3>

            <table class="w-full text-body-sm">
                <caption class="sr-only">
                    {{ __('product.specifications_for', ['name' => $product->name]) }}
                </caption>
                <tbody>
                    @foreach ($specifications as $specification)
                        <tr class="border-b border-border last:border-0">
                            <th scope="row" class="w-1/2 py-3 pe-4 text-start font-normal text-text-muted">
                                {{ $specification->label }}
                            </th>
                            <td class="py-3 font-medium">
                                {{-- Values are latin numbers with units inside Persian
                                     text, so they must not be reordered by the bidi
                                     algorithm. --}}
                                <x-ui.measure
                                    :value="$specification->translate('value')"
                                    :unit="$specification->unit"
                                />
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </section>
    @endforeach
</div>
