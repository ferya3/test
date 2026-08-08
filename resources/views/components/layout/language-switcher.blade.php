@php
    /** @var \App\Services\Localization\LocaleManager $locales */
    $locales = app(\App\Services\Localization\LocaleManager::class);
    $current = $locales->current();
@endphp

{{--
    Plain links, not a JavaScript control: switching language must work without
    JavaScript, and each alternate is a real crawlable URL for the same page.
--}}
<nav aria-label="{{ __('ui.language') }}" {{ $attributes->class(['flex items-center gap-1']) }}>
    @foreach ($locales->codes() as $code)
        @php $isCurrent = $code === $current; @endphp

        <a
            href="{{ $locales->alternateUrl($code) }}"
            hreflang="{{ $locales->hreflang($code) }}"
            lang="{{ $code }}"
            @if ($isCurrent) aria-current="true" @endif
            @class([
                'rounded-sm px-2.5 py-1.5 text-body-sm font-medium transition-colors',
                'bg-surface-subtle text-text' => $isCurrent,
                'text-text-muted hover:text-text' => ! $isCurrent,
            ])
        >{{ $locales->nativeName($code) }}</a>
    @endforeach
</nav>
