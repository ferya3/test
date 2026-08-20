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

                    /*
                     * A derivative is only generated when it would be smaller
                     * than the original, so a 1920px upload silently caps the
                     * srcset at 1920 and looks soft on a large monitor. That is
                     * correct behaviour — upscaling would ship a bigger, blurrier
                     * file — but it is invisible: the image uploads fine, appears
                     * fine, and only looks wrong on hardware the operator may not
                     * have. So it is said here, at the moment the image is chosen.
                     */
                    $largestWidth = max(config('media.widths', [1920]));
                    $tooNarrow = $image?->isImage()
                        && $image->width !== null
                        && $image->width < $largestWidth;
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

                            @if ($tooNarrow)
                                <p class="mt-3 rounded-md border border-warning-tint-text/30 bg-warning-tint px-3.5 py-2.5 text-caption text-warning-tint-text">
                                    {{ __('admin.site_images.too_narrow', [
                                        'width' => $image->width,
                                        'largest' => $largestWidth,
                                    ]) }}
                                </p>
                            @endif
                        </div>
                    </div>
                </section>
            @endforeach
        </div>

        <x-ui.button type="submit" size="lg" class="mt-6">{{ __('admin.save') }}</x-ui.button>
    </form>
</x-layouts.admin>
