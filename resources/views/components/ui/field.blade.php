{{--
    Label / hint / error chrome around a form control.

    The control is expected to wire its own aria-describedby using
    App\Support\FormIds, which derives the same ids this component renders. The
    self-contained controls (x-ui.input, x-ui.textarea, x-ui.select) do that for
    you; use this component directly only when building a bespoke control.
--}}
@props([
    'label' => null,
    'id' => null,
    'name' => null,
    'hint' => null,
    'error' => null,
    'required' => false,
    'optionalLabel' => false,
])

@php
    use App\Support\FormIds;

    $controlId = $id ?? $name;
    $message = $error ?? ($name ? $errors->first($name) : null);
@endphp

<div {{ $attributes->class(['flex flex-col gap-2']) }}>
    @if ($label)
        <label for="{{ $controlId }}" class="flex items-center gap-1.5 text-body-sm font-medium text-text">
            {{ $label }}

            @if ($required)
                {{-- Decorative: `required` on the control is what assistive
                     technology announces. --}}
                <span aria-hidden="true" class="text-danger-tint-text">*</span>
            @elseif ($optionalLabel)
                <span class="text-caption font-normal text-text-muted">{{ __('ui.optional') }}</span>
            @endif
        </label>
    @endif

    {{ $slot }}

    @if ($hint && ! $message)
        <p id="{{ FormIds::hint($controlId) }}" class="text-caption text-text-muted">{{ $hint }}</p>
    @endif

    @if ($message)
        {{-- role="alert" so a validation failure is announced after submission. --}}
        <p
            id="{{ FormIds::error($controlId) }}"
            role="alert"
            class="flex items-start gap-1.5 text-caption text-danger-tint-text"
        >
            <svg class="mt-0.5 size-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6h1.5V12h-1.5v-1.5Z" />
            </svg>
            {{ $message }}
        </p>
    @endif
</div>
