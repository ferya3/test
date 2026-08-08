@props([
    'name',
    'label' => null,
    'hint' => null,
    'error' => null,
    // value => label
    'options' => [],
    'selected' => null,
    'placeholder' => null,
    'required' => false,
    'optionalLabel' => false,
    'id' => null,
])

@php
    use App\Support\FormIds;

    $controlId = $id ?? $name;
    $message = $error ?? $errors->first($name);
    $describedBy = FormIds::describedBy($controlId, filled($hint), filled($message));
    $current = old($name, $selected);
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
        <select
            id="{{ $controlId }}"
            name="{{ $name }}"
            @required($required)
            @if ($describedBy) aria-describedby="{{ $describedBy }}" @endif
            @if ($message) aria-invalid="true" @endif
            {{ $attributes->except('class')->class([
                // The native chevron is hidden and redrawn so it sits on the
                // correct side in RTL, which appearance:auto does not guarantee.
                'h-11 w-full appearance-none rounded-md border bg-surface-raised',
                'text-body text-text ps-3.5 pe-10',
                'transition-colors duration-150 ease-industrial',
                'focus:border-accent-surface focus:outline-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted',
                $message ? 'border-danger-surface' : 'border-border-strong',
            ]) }}
        >
            @if ($placeholder)
                <option value="" @selected($current === null || $current === '')>{{ $placeholder }}</option>
            @endif

            @foreach ($options as $optionValue => $optionLabel)
                <option value="{{ $optionValue }}" @selected((string) $current === (string) $optionValue)>
                    {{ $optionLabel }}
                </option>
            @endforeach

            {{ $slot }}
        </select>

        <svg
            class="pointer-events-none absolute inset-y-0 end-3.5 my-auto size-4 text-text-muted"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    </div>
</x-ui.field>
