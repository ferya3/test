@props([
    'name',
    'label' => null,
    'hint' => null,
    'error' => null,
    'value' => null,
    'rows' => 5,
    'required' => false,
    'optionalLabel' => false,
    'id' => null,
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
    <textarea
        id="{{ $controlId }}"
        name="{{ $name }}"
        rows="{{ $rows }}"
        @required($required)
        @if ($describedBy) aria-describedby="{{ $describedBy }}" @endif
        @if ($message) aria-invalid="true" @endif
        {{ $attributes->except('class')->class([
            'w-full resize-y rounded-md border bg-surface-raised px-3.5 py-3 text-body text-text',
            'placeholder:text-text-placeholder',
            'transition-colors duration-150 ease-industrial',
            'focus:border-accent-surface focus:outline-none',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted',
            $message ? 'border-danger-surface' : 'border-border-strong',
        ]) }}
    >{{ old($name, $value) }}</textarea>
</x-ui.field>
