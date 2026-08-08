{{--
    Faceted filter panel.

    Every option is a link to the same page with one value toggled, so filtering
    works with JavaScript disabled and each filter combination is a real,
    shareable, crawlable URL. Alpine only handles the mobile drawer and the
    collapse state of each group.
--}}
@props([
    'filters',
    'facets' => [],
    'groups' => [],
    'route' => null,
])

@php
    $target = $route ?? lroute('products.index');

    // A filter combination that yields nothing is a dead end for crawlers as
    // well as people, so options with a zero count are disabled rather than
    // linked.
    $urlFor = fn (string $key, string $value): string =>
        $target.'?'.http_build_query($filters->toggle($key, $value)->toQuery());
@endphp

<div {{ $attributes->class(['flex flex-col gap-6']) }}>
    <div class="flex items-center justify-between gap-3">
        <h2 class="text-h4">{{ __('ui.filters') }}</h2>

        @if ($filters->hasAny())
            <a
                href="{{ $target.'?'.http_build_query($filters->cleared()->toQuery()) }}"
                class="rounded-xs text-caption text-accent-text underline-offset-4 hover:underline"
            >{{ __('ui.clear_filters') }}</a>
        @endif
    </div>

    @foreach ($groups as $key => $group)
        @php
            $counts = $facets[$key] ?? [];
            $options = collect($group['options'])
                ->filter(fn (array $option): bool =>
                    ($counts[$option['value']] ?? 0) > 0 || $filters->isActive($key, $option['value']))
                ->values();
        @endphp

        @continue($options->isEmpty())

        {{-- Native disclosure: keyboard accessible and functional without JS. --}}
        <details class="group border-b border-border pb-5 last:border-0" open>
            <summary
                class="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-body-sm font-semibold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
                {{ $group['label'] }}

                <svg
                    class="size-4 shrink-0 text-text-muted transition-transform group-open:-rotate-180"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                >
                    <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </summary>

            <ul class="mt-3 flex max-h-64 flex-col gap-0.5 overflow-y-auto pe-1">
                @foreach ($options as $option)
                    @php
                        $active = $filters->isActive($key, $option['value']);
                        $count = $counts[$option['value']] ?? 0;
                    @endphp

                    <li>
                        <a
                            href="{{ $urlFor($key, $option['value']) }}"
                            rel="nofollow"
                            @if ($active) aria-current="true" @endif
                            @class([
                                'flex items-center gap-2.5 rounded-sm px-2 py-2 text-body-sm transition-colors',
                                'bg-accent-tint text-accent-tint-text font-medium' => $active,
                                'text-text-secondary hover:bg-surface-subtle hover:text-text' => ! $active,
                            ])
                        >
                            {{-- Presentational tick: state is conveyed by aria-current. --}}
                            <span
                                aria-hidden="true"
                                @class([
                                    'grid size-4 shrink-0 place-items-center rounded-xs border',
                                    'border-accent-surface bg-accent-surface text-white' => $active,
                                    'border-border-strong' => ! $active,
                                ])
                            >
                                @if ($active)
                                    <svg class="size-3" viewBox="0 0 16 16" fill="none">
                                        <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                @endif
                            </span>

                            @if (! empty($option['hex']))
                                <span
                                    aria-hidden="true"
                                    class="size-3.5 shrink-0 rounded-full border border-border"
                                    style="background-color: {{ $option['hex'] }}"
                                ></span>
                            @endif

                            <span class="flex-1">{{ $option['label'] }}</span>

                            <x-ui.measure :value="$count" class="text-caption text-text-muted" />
                        </a>
                    </li>
                @endforeach
            </ul>
        </details>
    @endforeach
</div>
