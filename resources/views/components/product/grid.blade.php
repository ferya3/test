@props([
    'products',
    // Number of cards treated as above the fold, so their images load eagerly.
    'priorityCount' => 3,
    // Widest-screen column count. A prop rather than a class passed in from
    // the caller: two competing `lg:grid-cols-*` utilities both survive the
    // attribute merge and the stylesheet order decides which wins, which is a
    // silent way to get the wrong layout.
    'columns' => 4,
])

@php
    $widths = [
        3 => 'lg:grid-cols-3',
        4 => 'md:grid-cols-3 lg:grid-cols-4',
    ];
@endphp

@if (count($products) === 0)
    {{ $empty ?? '' }}
@else
    {{--
        Two columns from the narrowest screen up, not one. A panel is read by
        its decor, and a phone showing one full-width card per screen turns a
        24-product range into a scroll marathon — the visitor cannot compare
        two finishes without losing their place. The tighter gap below `sm`
        keeps both cards wide enough to show the decor.
    --}}
    <ul {{ $attributes->class(['grid grid-cols-2 gap-3 sm:gap-5', $widths[$columns] ?? $widths[4]]) }}>
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
