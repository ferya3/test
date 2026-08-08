{{--
    Cycles light → dark → system. Rendered only when JavaScript runs, because a
    dead toggle is worse than no toggle: without JS the page already follows the
    OS preference correctly.
--}}
<button
    type="button"
    x-data
    x-cloak
    x-on:click="$store.theme.toggle()"
    x-bind:aria-label="$store.theme.isDark ? '{{ __('ui.switch_to_light') }}' : '{{ __('ui.switch_to_dark') }}'"
    {{ $attributes->class([
        'inline-flex size-10 items-center justify-center rounded-md text-text-muted',
        'transition-colors hover:bg-surface-subtle hover:text-text',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    ]) }}
>
    {{-- Sun --}}
    <svg x-show="! $store.theme.isDark" class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="3.75" stroke="currentColor" stroke-width="1.5" />
        <path
            d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.5 4.5l1 1M14.5 14.5l1 1M15.5 4.5l-1 1M5.5 14.5l-1 1"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
        />
    </svg>

    {{-- Moon --}}
    <svg x-show="$store.theme.isDark" class="size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
            d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
        />
    </svg>
</button>
