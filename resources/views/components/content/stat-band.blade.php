@props(['stats' => []])

@if (count($stats) > 0)
    <dl {{ $attributes->class(['grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4']) }}>
        @foreach ($stats as $stat)
            <div class="flex flex-col gap-1 bg-surface p-6">
                <dt class="order-2 text-body-sm text-text-muted">{{ $stat['label'] }}</dt>
                <dd class="order-1 text-h2 font-bold">
                    <x-ui.measure :value="$stat['value']" :unit="$stat['unit'] ?? null" dir="ltr" />
                </dd>
            </div>
        @endforeach
    </dl>
@endif
