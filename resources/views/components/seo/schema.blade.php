@props(['seo' => null, 'data' => null])

@php
    $structuredData = $data ?? $seo?->structuredData ?? [];
@endphp

{{--
    Js::encode() (not Js::from()) — from() wraps object/array data as a
    JSON.parse('...') *JavaScript expression*, which is meant for an executed
    <script> context. application/ld+json is never executed; a crawler parses
    the tag's raw text as JSON, so a JS wrapper would make it unparsable.
    encode() applies the same JSON_HEX_TAG/APOS/QUOT/AMP flags without the
    wrapper: a stray "</script>" or quote inside translated content becomes a
    \uXXXX escape (a legal JSON string escape) instead of breaking out of the
    tag, and the result is still raw, valid JSON. {!! !!} is required — {{ }}
    would HTML-entity-escape the already-safe JSON and corrupt it.

    Accepts either a full SeoData (:seo, used once in the layout head) or a
    raw JSON-LD document (:data), so a page can emit an additional graph —
    breadcrumbs, most often — right where it already builds the data for it,
    without threading it back through the controller's SeoData.
--}}
@if ($structuredData !== [])
    <script type="application/ld+json" nonce="{{ Illuminate\Support\Facades\Vite::cspNonce() }}">{!! Illuminate\Support\Js::encode($structuredData) !!}</script>
@endif
