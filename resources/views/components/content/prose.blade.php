{{--
    Long-form body copy. The typography plugin is scoped to this component so
    editor-authored HTML never leaks styles into the rest of the page.
--}}
<div {{ $attributes->class([
    'prose max-w-content',
    'prose-headings:font-semibold prose-headings:text-text',
    'prose-p:text-text-secondary prose-li:text-text-secondary',
    'prose-a:text-accent-text prose-a:underline-offset-4',
    'prose-strong:text-text',
    'prose-img:rounded-lg',
]) }}>
    {{ $slot }}
</div>
