{{--
    Abstract wave that closes a hero into the section beneath it.

    Three offset layers rather than one line: a single curve reads as a shape
    sitting on the photograph, while layers at different amplitudes and speeds
    read as depth, and never resolve into a picture of anything. The front layer
    is opaque `--surface`, so it *is* the boundary between hero and page rather
    than a decoration drawn near it — which is what keeps it correct in both
    themes without a second set of colours.

    Each layer's path tiles every 1440 units and is drawn twice across a 2880
    unit group, so translating by exactly one tile loops with no seam. The
    animation is decorative and the global `prefers-reduced-motion` rule in
    app.css stops it; nothing here depends on movement.
--}}
@props([
    // Height of the band. Deliberately short on phones, where it would
    // otherwise eat the part of the hero the photograph is for.
    'class' => '',
])

<div
    aria-hidden="true"
    {{ $attributes->class([
        'pointer-events-none absolute inset-x-0 bottom-0 z-0 h-14 md:h-24 lg:h-32',
        $class,
    ]) }}
>
    <svg
        class="size-full"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        fill="none"
        focusable="false"
    >
        {{-- Back: accent-tinted, the deepest and slowest. --}}
        <g class="wave-drift" style="--wave-duration: 31s">
            <path
                d="M0,104 C240,52 480,156 720,104 C960,52 1200,156 1440,104 C1680,52 1920,156 2160,104 C2400,52 2640,156 2880,104 L2880,200 L0,200 Z"
                fill="var(--accent)"
                opacity="0.16"
            />
        </g>

        {{-- Middle: surface at partial alpha, drifting the other way so the
             two never travel together and the band does not read as a single
             sliding object. --}}
        <g class="wave-drift wave-drift-reverse" style="--wave-duration: 23s">
            <path
                d="M0,128 C180,96 420,168 720,128 C1020,88 1260,160 1440,128 C1620,96 1860,168 2160,128 C2460,88 2700,160 2880,128 L2880,200 L0,200 Z"
                fill="var(--surface)"
                opacity="0.5"
            />
        </g>

        {{-- Front: the actual edge of the page surface. Opaque, so whatever the
             photograph is doing stops here. --}}
        <g class="wave-drift" style="--wave-duration: 17s">
            <path
                d="M0,156 C200,132 460,188 720,156 C980,124 1240,180 1440,156 C1640,132 1900,188 2160,156 C2420,124 2680,180 2880,156 L2880,200 L0,200 Z"
                fill="var(--surface)"
            />
        </g>
    </svg>
</div>
