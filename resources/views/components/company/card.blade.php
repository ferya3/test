{{--
    One subsidiary, as a card: on the companies index, the homepage band and
    the "other group companies" row at the foot of a company page.

    The company's accent is applied through a custom property and used only on
    the rule across the top — never on text, so an editor can choose any colour
    without a contrast check standing between them and saving the form.
--}}
@props([
    'company',
    'headingLevel' => 3,
    'sizes' => '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw',
])

@php
    $tag = 'h'.max(2, min(6, (int) $headingLevel));
    $headingId = 'company-'.$company->id;
@endphp

<x-ui.card
    :href="lroute('companies.show', ['company' => $company->slug])"
    :labelledby="$headingId"
    padding="none"
    :style="$company->accentStyle()"
    class="w-full overflow-hidden"
>
    <span aria-hidden="true" class="company-rule block h-1 w-full"></span>

    <x-media.picture
        :media="$company->cover"
        :alt="$company->name"
        ratio="4/3"
        :sizes="$sizes"
        class="w-full"
    />

    <div class="flex flex-1 flex-col gap-2 p-6">
        @if ($company->sector)
            <p class="text-caption text-text-muted">{{ $company->sector }}</p>
        @endif

        <{{ $tag }} id="{{ $headingId }}" class="text-h4">{{ $company->name }}</{{ $tag }}>

        @if ($company->summary)
            <p class="line-clamp-3 text-body-sm text-text-muted">{{ $company->summary }}</p>
        @endif

        <span aria-hidden="true" class="mt-auto pt-4 text-body-sm font-semibold text-accent-text">
            {{ __('cta.view_company') }}
        </span>
    </div>
</x-ui.card>
