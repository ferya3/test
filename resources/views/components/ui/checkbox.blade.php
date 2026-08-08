@props([
    'name',
    'label' => null,
    'value' => '1',
    'checked' => false,
    'hint' => null,
    'error' => null,
    'id' => null,
    // Renders a filter-style count beside the label, e.g. "High Gloss (12)".
    'count' => null,
])

@php
    use App\Support\FormIds;

    $controlId = $id ?? $name.'-'.\Illuminate\Support\Str::slug((string) $value);
    $message = $error ?? $errors->first($name);
    $describedBy = FormIds::describedBy($controlId, filled($hint), filled($message));
@endphp

<div {{ $attributes->only('class')->class(['flex flex-col gap-1']) }}>
    {{-- The label wraps the control, so the whole row is a hit target. --}}
    <label
        for="{{ $controlId }}"
        class="group inline-flex cursor-pointer items-center gap-3 py-1 text-body-sm text-text select-none"
    >
        <input
            id="{{ $controlId }}"
            name="{{ $name }}"
            type="checkbox"
            value="{{ $value }}"
            @checked($checked)
            @if ($describedBy) aria-describedby="{{ $describedBy }}" @endif
            {{ $attributes->except('class')->class([
                'size-4.5 shrink-0 appearance-none rounded-xs border border-border-strong bg-surface-raised',
                'transition-colors duration-150 ease-industrial',
                'checked:border-accent-surface checked:bg-accent-surface',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                'disabled:cursor-not-allowed disabled:bg-surface-subtle',
                // Tick drawn with a background image so it inherits the checked
                // state without extra markup.
                "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"m3.5 8.5 3 3 6-7\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>')] checked:bg-center checked:bg-no-repeat",
            ]) }}
        >

        <span class="flex-1">{{ $label ?? $slot }}</span>

        @if ($count !== null)
            <span class="tabular text-caption text-text-muted">{{ $count }}</span>
        @endif
    </label>

    @if ($hint && ! $message)
        <p id="{{ FormIds::hint($controlId) }}" class="ms-7.5 text-caption text-text-muted">{{ $hint }}</p>
    @endif

    @if ($message)
        <p id="{{ FormIds::error($controlId) }}" role="alert" class="ms-7.5 text-caption text-danger-tint-text">
            {{ $message }}
        </p>
    @endif
</div>
