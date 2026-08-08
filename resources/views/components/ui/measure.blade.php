{{--
    A value that must not be reordered by the bidirectional algorithm.

    On a Persian page a latin run inside RTL text gets reordered: "740 kg/m³"
    displays as "kg/m³ 740", and "+98 21 1234 5678" as "5678 1234 21 98+".
    Every specification value, sheet dimension, product code and phone number
    goes through this component rather than being interpolated directly.

    The unit is isolated separately from the value, because a unit beginning
    with a neutral character ("°C") is otherwise reordered into "C°" even when
    the value around it is correctly placed. Its direction is always resolved
    from its own content, so a latin unit ("kg/m³") reads LTR and a Persian one
    ("میلی‌متر") reads RTL.

    `dir` controls the value only:
      'auto' (default) resolves from the content. Correct for anything mixed —
             "تا 180", or a dimension whose unit is a Persian word — where
             forcing LTR would place the Persian text on the wrong side.
      'ltr'  for content that is latin in every locale and has no Persian in it:
             phone numbers, emails, URLs, product codes, hex values.
--}}
@props([
    'value',
    'unit' => null,
    'dir' => 'auto',
    // Tabular figures so values align down a column; disable inside prose.
    'tabular' => true,
])

<span {{ $attributes->class(['bidi-isolate', 'tabular' => $tabular]) }} dir="{{ $dir === 'ltr' ? 'ltr' : 'auto' }}"><span dir="{{ $dir }}" class="{{ $dir === 'ltr' ? 'ltr-isolate' : 'bidi-isolate' }}">{{ $value }}</span>@if ($unit)&nbsp;<span dir="auto" class="bidi-isolate">{{ $unit }}</span>@endif</span>
