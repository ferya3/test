@props(['entries' => []])

@if (count($entries) > 0)
    <ol {{ $attributes->class(['relative flex flex-col']) }}>
        @foreach ($entries as $entry)
            <li class="group relative flex gap-5 sm:gap-8">
                <div class="flex flex-col items-center">
                    <span aria-hidden="true" class="mt-1.5 size-3 shrink-0 rounded-full bg-accent"></span>
                    <span aria-hidden="true" class="mt-2 w-px flex-1 bg-border group-last:hidden"></span>
                </div>

                <div class="flex-1 pb-8">
                    <h3 class="text-h4">{{ $entry['heading'] }}</h3>

                    @if (! empty($entry['body']))
                        <p class="mt-1.5 max-w-content text-body text-text-secondary">{{ $entry['body'] }}</p>
                    @endif
                </div>
            </li>
        @endforeach
    </ol>
@endif
