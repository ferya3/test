@props(['stats' => []])

{{--
    A stat may set 'count' => true to have its figure count up as it scrolls
    into view (see resources/js/motion). The markup is the finished number
    either way, so without JavaScript — or with reduced motion — it reads
    exactly the same.

    'dir' defaults to ltr, right for a bare figure. A value that is a Persian
    phrase ("۲۴۰ هزار ورق در سال") passes 'auto'.
--}}
@php
    // As many columns as there are figures, up to four. A fixed four left an
    // empty cell showing the grid's border colour whenever a company reported
    // three figures. Written out in full so Tailwind can see every class.
    $columns = match (min(count($stats), 4)) {
        1 => '',
        2 => 'sm:grid-cols-2',
        3 => 'sm:grid-cols-3',
        default => 'sm:grid-cols-2 lg:grid-cols-4',
    };
@endphp

@if (count($stats) > 0)
    <dl {{ $attributes->class(['grid gap-px overflow-hidden rounded-lg border border-border bg-border', $columns]) }}>
        @foreach ($stats as $stat)
            <div class="flex flex-col gap-1 bg-surface p-6">
                <dt class="order-2 text-body-sm text-text-muted">{{ $stat['label'] }}</dt>
                <dd class="order-1 text-h2 font-bold">
                    <x-ui.measure
                        :value="$stat['value']"
                        :unit="$stat['unit'] ?? null"
                        :dir="$stat['dir'] ?? 'ltr'"
                        :data-motion="! empty($stat['count']) ? 'counter' : null"
                    />
                </dd>
            </div>
        @endforeach
    </dl>
@endif
