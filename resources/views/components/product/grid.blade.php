@props([
    'products',
    // Number of cards treated as above the fold, so their images load eagerly.
    'priorityCount' => 3,
])

@if (count($products) === 0)
    {{ $empty ?? '' }}
@else
    <ul {{ $attributes->class(['grid gap-5 sm:grid-cols-2 lg:grid-cols-3']) }}>
        @foreach ($products as $index => $product)
            <li class="flex">
                <x-product.card
                    :product="$product"
                    :priority="$index < $priorityCount"
                    class="w-full"
                />
            </li>
        @endforeach
    </ul>
@endif
