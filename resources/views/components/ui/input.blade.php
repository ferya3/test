@props([
    'name',
    'label' => null,
    'type' => 'text',
    'hint' => null,
    'error' => null,
    'value' => null,
    'required' => false,
    'optionalLabel' => false,
    'id' => null,
    // Rendered inside the control, before the text (search icon, currency, …).
    'leading' => null,
])

@php
    use App\Support\FormIds;

    $controlId = $id ?? $name;
    $message = $error ?? $errors->first($name);
    $describedBy = FormIds::describedBy($controlId, filled($hint), filled($message));
@endphp

<x-ui.field
    :label="$label"
    :id="$controlId"
    :name="$name"
    :hint="$hint"
    :error="$error"
    :required="$required"
    :optional-label="$optionalLabel"
    :class="$attributes->get('class')"
>
    <div class="relative">
        @if ($leading)
            {{-- Positioned with logical inset so it flips with the writing direction. --}}
            <span class="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-text-muted">
                {{ $leading }}
            </span>
        @endif

        <input
            id="{{ $controlId }}"
            name="{{ $name }}"
            type="{{ $type }}"
            value="{{ old($name, $value) }}"
            @required($required)
            @if ($describedBy) aria-describedby="{{ $describedBy }}" @endif
            @if ($message) aria-invalid="true" @endif
            {{ $attributes->except('class')->class([
                'h-11 w-full rounded-md border bg-surface-raised text-body text-text',
                'placeholder:text-text-placeholder',
                'transition-colors duration-150 ease-industrial',
                'focus:border-accent-surface focus:outline-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted',
                $leading ? 'ps-11 pe-3.5' : 'px-3.5',
                $message ? 'border-danger-surface' : 'border-border-strong',
            ]) }}
        >
    </div>
</x-ui.field>
