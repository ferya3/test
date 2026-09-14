{{--
    Faceted filter bar, above the grid.

    Every option is a link to the same page with one value toggled, so filtering
    works with JavaScript disabled and each combination is a real, shareable,
    crawlable URL.

    The dropdown is a native <details>/<summary> rather than an Alpine panel for
    the same reason: without JS it still opens, and it is keyboard accessible
    for free. Alpine only adds the three manners a dropdown is expected to
    have — close the others when one opens, close on Escape, close on a click
    outside — none of which the page needs in order to function.
--}}
@props([
    'filters',
    'facets' => [],
    'groups' => [],
    'route' => null,
    // Rendered inside the bar, opposite the dropdowns: the result count.
    'summary' => null,
])

@php
    $target = $route ?? lroute('categories.index');

    // A filter combination that yields nothing is a dead end for crawlers as
    // well as people, so options with a zero count are dropped rather than
    // linked.
    $urlFor = fn (string $key, string $value): string =>
        $target.'?'.http_build_query($filters->toggle($key, $value)->toQuery());

    // Options worth showing, per group, plus how many are currently on — the
    // count goes on the trigger so an active filter is visible while the
    // dropdown is shut.
    $visible = [];

    foreach ($groups as $key => $group) {
        $counts = $facets[$key] ?? [];

        $options = array_values(array_filter(
            $group['options'],
            fn (array $option): bool => ($counts[$option['value']] ?? 0) > 0
                || $filters->isActive($key, $option['value']),
        ));

        if ($options === []) {
            continue;
        }

        $visible[$key] = [
            'label' => $group['label'],
            'options' => $options,
            'counts' => $counts,
            'active' => count(array_filter(
                $options,
                fn (array $option): bool => $filters->isActive($key, $option['value']),
            )),
        ];
    }
@endphp

@if ($visible !== [] || $summary !== null)
    <div
        x-data
        {{-- `toggle` does not bubble, but it does reach an ancestor during the
             capture phase, which is what lets one listener here close the
             others. --}}
        @toggle.capture="
            $event.target.open && $root.querySelectorAll('details[open]').forEach(
                (d) => d !== $event.target && (d.open = false)
            )
        "
        @keydown.escape="$root.querySelectorAll('details[open]').forEach((d) => (d.open = false))"
        @click.outside="$root.querySelectorAll('details[open]').forEach((d) => (d.open = false))"
        {{ $attributes->class([
            'mb-8 flex flex-col gap-4 border-b border-border pb-5',
            'md:flex-row md:items-center md:justify-between md:gap-6',
        ]) }}
    >
        @if ($visible !== [])
            {{-- Wraps on a phone rather than scrolling sideways: a filter the
                 visitor cannot see is a filter they will not use. --}}
            <div class="flex flex-wrap items-center gap-2.5">
                <h2 class="sr-only">{{ __('ui.filters') }}</h2>

                @foreach ($visible as $key => $group)
                    <details class="group relative">
                        <summary
                            @class([
                                'flex cursor-pointer list-none items-center gap-2 rounded-lg border px-4 py-2.5',
                                'text-body-sm font-medium transition-colors marker:hidden',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                                'border-accent-tint-border bg-accent-tint text-accent-tint-text' => $group['active'] > 0,
                                'border-border-strong bg-surface-raised text-text hover:border-text-muted' => $group['active'] === 0,
                            ])
                        >
                            {{ $group['label'] }}

                            @if ($group['active'] > 0)
                                <span class="grid size-5 place-items-center rounded-full bg-accent-surface text-caption font-semibold text-text-on-accent">
                                    <span class="bidi-isolate tabular" dir="auto">{{ $group['active'] }}</span>
                                </span>
                            @endif

                            <svg
                                class="size-4 shrink-0 transition-transform group-open:-rotate-180"
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                        </summary>

                        {{-- `start-0` not `left-0`: the panel hangs from the
                             same edge as its trigger in both directions. --}}
                        <div
                            class="absolute start-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface-raised p-2 shadow-lg"
                        >
                            <ul class="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                                @foreach ($group['options'] as $option)
                                    @php
                                        $active = $filters->isActive($key, $option['value']);
                                        $count = $group['counts'][$option['value']] ?? 0;
                                    @endphp

                                    <li>
                                        <a
                                            href="{{ $urlFor($key, $option['value']) }}"
                                            rel="nofollow"
                                            @if ($active) aria-current="true" @endif
                                            @class([
                                                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm transition-colors',
                                                'bg-accent-tint font-medium text-accent-tint-text' => $active,
                                                'text-text-secondary hover:bg-surface-subtle hover:text-text' => ! $active,
                                            ])
                                        >
                                            {{-- Presentational tick: the state
                                                 itself is on aria-current. --}}
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

                                            {{--
                                                The markup <x-ui.measure> would
                                                emit, inlined. That component
                                                earns its cost on mixed
                                                latin/Persian runs, where the
                                                bidi algorithm would reorder the
                                                parts. A facet count is a bare
                                                integer with nothing to reorder,
                                                and this is the hottest line on
                                                the page: one render per option
                                                per attribute.
                                            --}}
                                            <span class="bidi-isolate tabular text-caption text-text-muted" dir="auto">{{ $count }}</span>
                                        </a>
                                    </li>
                                @endforeach
                            </ul>
                        </div>
                    </details>
                @endforeach

                @if ($filters->hasAny())
                    <a
                        href="{{ $target.'?'.http_build_query($filters->cleared()->toQuery()) }}"
                        class="rounded-md px-2 py-2 text-body-sm text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >{{ __('ui.clear_filters') }}</a>
                @endif
            </div>
        @endif

        @if ($summary !== null)
            <p class="text-body-sm text-text-muted">{{ $summary }}</p>
        @endif
    </div>
@endif
