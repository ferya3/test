{{--
    A value that must not be reordered by the bidirectional algorithm.

    On a Persian page a latin run inside RTL text gets reordered: "740 kg/m³"
    displays as "kg/m³ 740", and "+98 21 1234 5678" as "5678 1234 21 98+".
    Every specification value, sheet dimension, product code and phone number
    goes through this component rather than being interpolated directly.

    The unit is isolated as LTR separately from the value, because a unit like
    "°C" begins with a neutral character that the algorithm otherwise reorders
    into "C°" — even when the value around it is correctly placed.

    `dir` controls the value only:
      'auto' (default) resolves from the content, which is what mixed values
             such as "تا 180" need — forcing LTR would move the Persian word.
      'ltr'  for content that is latin in every locale: phone numbers, emails,
             URLs, product codes, dimensions.
--}}
@props([
    'value',
    'unit' => null,
    'dir' => 'auto',
    // Tabular figures so values align down a column; disable inside prose.
    'tabular' => true,
])

<span {{ $attributes->class(['bidi-isolate', 'tabular' => $tabular]) }} dir="{{ $dir === 'ltr' ? 'ltr' : 'auto' }}"><span dir="{{ $dir }}" class="{{ $dir === 'ltr' ? 'ltr-isolate' : 'bidi-isolate' }}">{{ $value }}</span>@if ($unit)&nbsp;<span dir="ltr" class="ltr-isolate">{{ $unit }}</span>@endif</span>
