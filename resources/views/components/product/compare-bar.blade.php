{{--
    Floating tray summarising the current comparison selection.

    Only appears once something is selected, and only when JavaScript runs.
--}}
<div
    x-data
    x-cloak
    x-show="$store.compare.count > 0"
    x-transition.opacity
    class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised/95 backdrop-blur-sm"
>
    <x-layout.container class="flex items-center gap-4 py-3">
        <p class="flex-1 text-body-sm">
            <span class="font-semibold" x-text="$store.compare.count"></span>
            <span>{{ __('compare.selected') }}</span>
            <span class="text-text-muted" x-show="$store.compare.isFull">
                — {{ __('ui.compare_full', ['limit' => 4]) }}
            </span>
        </p>

        <button
            type="button"
            x-on:click="$store.compare.clear()"
            class="rounded-sm px-3 py-2 text-body-sm text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >{{ __('compare.clear') }}</button>

        {{-- Slugs travel in the URL so a comparison can be shared or bookmarked. --}}
        <a
            x-bind:href="'{{ lroute('compare') }}?products=' + $store.compare.slugs.join(',')"
            class="inline-flex h-11 items-center rounded-md bg-accent-surface px-5 text-body-sm font-semibold text-text-on-accent transition-colors hover:bg-accent-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >{{ __('ui.compare') }}</a>
    </x-layout.container>
</div>
