@props([
    // list<array{label: string, url?: string|null}>
    // The last entry is the current page and is rendered without a link.
    'items' => [],
])

@if (count($items) > 0)
    <nav aria-label="{{ __('ui.breadcrumb') }}" {{ $attributes }}>
        <ol class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
            @foreach ($items as $index => $item)
                @php $isLast = $index === count($items) - 1; @endphp

                <li class="flex items-center gap-2">
                    @if (! $isLast && ! empty($item['url']))
                        <a
                            href="{{ $item['url'] }}"
                            class="rounded-xs underline-offset-4 transition-colors hover:text-text hover:underline"
                        >{{ $item['label'] }}</a>
                    @else
                        <span @if ($isLast) aria-current="page" class="text-text" @endif>{{ $item['label'] }}</span>
                    @endif

                    @unless ($isLast)
                        {{-- Chevron points along the reading direction, so it is
                             mirrored under RTL by the logical rotate. --}}
                        <svg
                            class="size-3 shrink-0 text-text-placeholder rtl:-scale-x-100"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path d="m4.5 2.5 3 3.5-3 3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                    @endunless
                </li>
            @endforeach
        </ol>
    </nav>
@endif
