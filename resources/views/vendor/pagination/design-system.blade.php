@if ($paginator->hasPages())
    {{-- Chevrons point along the reading direction, so they mirror under RTL. --}}
    <nav aria-label="{{ __('ui.pagination') }}" class="flex items-center justify-between gap-4 border-t border-border pt-6">
        <div class="flex flex-1 items-center gap-2">
            @if ($paginator->onFirstPage())
                <span class="inline-flex h-10 items-center gap-2 rounded-md px-4 text-body-sm text-text-placeholder">
                    <svg class="size-4 rtl:-scale-x-100" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    {{ __('ui.previous') }}
                </span>
            @else
                <a
                    href="{{ $paginator->previousPageUrl() }}"
                    rel="prev"
                    class="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-4 text-body-sm font-medium transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    <svg class="size-4 rtl:-scale-x-100" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    {{ __('ui.previous') }}
                </a>
            @endif
        </div>

        <p class="text-body-sm text-text-muted">
            <x-ui.measure :value="$paginator->currentPage()" dir="ltr" />
            <span class="mx-1">/</span>
            <x-ui.measure :value="$paginator->lastPage()" dir="ltr" />
        </p>

        <div class="flex flex-1 items-center justify-end gap-2">
            @if ($paginator->hasMorePages())
                <a
                    href="{{ $paginator->nextPageUrl() }}"
                    rel="next"
                    class="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-4 text-body-sm font-medium transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                    {{ __('ui.next') }}
                    <svg class="size-4 rtl:-scale-x-100" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="m6.5 3.5 4.5 4.5-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </a>
            @else
                <span class="inline-flex h-10 items-center gap-2 rounded-md px-4 text-body-sm text-text-placeholder">
                    {{ __('ui.next') }}
                    <svg class="size-4 rtl:-scale-x-100" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="m6.5 3.5 4.5 4.5-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </span>
            @endif
        </div>
    </nav>
@endif
