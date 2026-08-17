<x-layouts.admin :title="__('admin.resources.site_images')">
    <p class="mb-6 max-w-2xl text-body-sm text-text-muted">
        {{ __('admin.site_images.intro') }}
    </p>

    <form method="POST" action="{{ route('admin.site-images.update') }}" class="max-w-3xl">
        @csrf
        @method('PUT')

        <div class="flex flex-col gap-4">
            @foreach ($slots as $slot)
                @php
                    $assigned = $current[$slot->key] ?? null;
                    $image = $assigned === null ? null : $media->get($assigned);
                @endphp

                <section class="rounded-lg border border-border bg-surface p-6">
                    <div class="mb-4">
                        <h2 class="text-h4">{{ $slot->label }}</h2>
                        <p class="mt-1 text-body-sm text-text-muted">{{ $slot->location }}</p>
                    </div>

                    <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {{-- The image as it stands. An empty slot says so in
                             words rather than leaving a gap the operator has to
                             interpret. --}}
                        <div class="w-full shrink-0 sm:w-40">
                            @if ($image)
                                <x-media.picture
                                    :media="$image"
                                    alt=""
                                    ratio="4/3"
                                    sizes="160px"
                                    class="w-full overflow-hidden rounded-md border border-border"
                                />
                            @else
                                <div class="grid h-30 w-full place-items-center rounded-md border border-dashed border-border-strong text-caption text-text-muted">
                                    {{ __('admin.site_images.empty') }}
                                </div>
                            @endif
                        </div>

                        <div class="min-w-0 flex-1">
                            <x-admin.media-picker
                                :name="'images['.$slot->key.']'"
                                :label="__('admin.field.image')"
                                :value="$assigned"
                                :hint="$slot->guidance"
                            />
                        </div>
                    </div>
                </section>
            @endforeach
        </div>

        <x-ui.button type="submit" size="lg" class="mt-6">{{ __('admin.save') }}</x-ui.button>
    </form>
</x-layouts.admin>
