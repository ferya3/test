{{--
    Adds a product to the comparison tray.

    Rendered only when JavaScript runs (x-cloak), because comparison is stored
    client-side. The comparison page itself resolves products server-side from
    slugs in the URL, so nothing here is trusted.
--}}
@props(['product'])

<button
    type="button"
    x-data
    x-cloak
    x-on:click="$store.compare.toggle('{{ $product->slug }}')"
    x-bind:aria-pressed="$store.compare.has('{{ $product->slug }}') ? 'true' : 'false'"
    x-bind:disabled="! $store.compare.has('{{ $product->slug }}') && $store.compare.isFull"
    {{ $attributes->class([
        'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-strong px-5',
        'text-body-sm font-semibold transition-colors',
        'hover:bg-surface-subtle',
        'aria-pressed:border-accent-surface aria-pressed:bg-accent-tint aria-pressed:text-accent-tint-text',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    ]) }}
>
    <svg class="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 4h5M2 8h5M2 12h5M11 4h3M11 8h3M11 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <span x-text="$store.compare.has('{{ $product->slug }}')
        ? '{{ __('ui.compare_remove') }}'
        : '{{ __('ui.compare_add') }}'">{{ __('ui.compare_add') }}</span>
</button>
