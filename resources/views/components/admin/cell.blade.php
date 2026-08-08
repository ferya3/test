@props(['record', 'field'])

@php
    $value = $record->{$field->name};
@endphp

@switch($field->type)
    @case('checkbox')
        @if ($value)
            <x-ui.badge tone="success" size="sm">{{ __('admin.yes') }}</x-ui.badge>
        @else
            <x-ui.badge size="sm">{{ __('admin.no') }}</x-ui.badge>
        @endif
        @break

    @case('color')
        <span class="inline-flex items-center gap-2">
            @if ($value)
                {{-- Data-driven colour, so it cannot be a utility class. --}}
                <span aria-hidden="true" class="size-4 rounded-sm border border-border" style="background-color: {{ $value }}"></span>
            @endif
            <x-ui.measure :value="$value ?? '—'" dir="ltr" />
        </span>
        @break

    @case('date')
        @if ($value)
            <x-ui.measure :value="$value->format('Y-m-d')" dir="ltr" />
        @else
            <span class="text-text-placeholder">—</span>
        @endif
        @break

    @case('number')
        <x-ui.measure :value="$value ?? 0" dir="ltr" />
        @break

    @case('select')
        {{-- Show the human label, not the raw foreign key or enum case. --}}
        {{ $field->optionLabel($value) }}
        @break

    @default
        @if (filled($value))
            <span class="line-clamp-2">{{ $field->optionLabel($value) }}</span>
        @else
            <span class="text-text-placeholder">—</span>
        @endif
@endswitch
