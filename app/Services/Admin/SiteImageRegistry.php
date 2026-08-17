<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Media;
use App\Models\Page;
use App\Models\Setting;
use App\Support\Data\SiteImageSlot;
use App\Support\Enums\PageTemplate;
use Illuminate\Support\Collection;

/**
 * The catalogue of fixed images on the site, and how to read and write each one.
 *
 * Two storage shapes sit behind a single list. A hero that belongs to an
 * editorial page is a column on that page's row, because the page owns it and
 * deleting the page should take it along. The homepage hero has no such record —
 * the homepage is a route, not a Page — so it lives in settings, next to the
 * homepage introduction text that is already kept there for the same reason.
 *
 * Both are presented identically, because which of the two a given image happens
 * to be is exactly the detail that made this confusing to find.
 */
class SiteImageRegistry
{
    /**
     * @return list<SiteImageSlot>
     */
    public function slots(): array
    {
        return [
            new SiteImageSlot(
                key: 'home_hero',
                label: __('admin.site_images.home_hero'),
                location: __('admin.site_images.home_hero_where'),
                guidance: __('admin.site_images.wide_guidance'),
                source: 'setting',
                target: 'home_hero_media_id',
            ),
            new SiteImageSlot(
                key: 'about_hero',
                label: __('admin.site_images.about_hero'),
                location: __('admin.site_images.about_hero_where'),
                guidance: __('admin.site_images.landscape_guidance'),
                source: 'page',
                target: PageTemplate::About->value,
            ),
            new SiteImageSlot(
                key: 'factory_hero',
                label: __('admin.site_images.factory_hero'),
                location: __('admin.site_images.factory_hero_where'),
                guidance: __('admin.site_images.landscape_guidance'),
                source: 'page',
                target: PageTemplate::Factory->value,
            ),
            new SiteImageSlot(
                key: 'process_hero',
                label: __('admin.site_images.process_hero'),
                location: __('admin.site_images.process_hero_where'),
                guidance: __('admin.site_images.landscape_guidance'),
                source: 'page',
                target: PageTemplate::Process->value,
            ),
            new SiteImageSlot(
                key: 'quality_hero',
                label: __('admin.site_images.quality_hero'),
                location: __('admin.site_images.quality_hero_where'),
                guidance: __('admin.site_images.landscape_guidance'),
                source: 'page',
                target: PageTemplate::Quality->value,
            ),
        ];
    }

    /**
     * Current media id for every slot, keyed by slot key.
     *
     * Resolved in two queries rather than one per slot: the pages are fetched
     * together and the settings blob is already cached.
     *
     * @return array<string, int|null>
     */
    public function current(): array
    {
        $pages = $this->pagesByTemplate();

        $settings = Setting::query()
            ->whereIn('key', $this->settingKeys())
            ->pluck('value', 'key');

        $current = [];

        foreach ($this->slots() as $slot) {
            $current[$slot->key] = $slot->source === 'page'
                ? $pages->get($slot->target)?->hero_media_id
                : $this->toId($settings->get($slot->target));
        }

        return $current;
    }

    /**
     * Assigns a media id — or null to clear — to one slot.
     *
     * A slot whose backing record is missing is skipped rather than created:
     * the editorial pages are seeded structure, and inventing one here would
     * produce a page with no body that nothing routes to.
     */
    public function assign(SiteImageSlot $slot, ?int $mediaId): void
    {
        if ($slot->source === 'page') {
            $page = $this->pagesByTemplate()->get($slot->target);

            if ($page !== null) {
                $page->hero_media_id = $mediaId;
                $page->save();
            }

            return;
        }

        // Written through the model, not the query builder: the builder would
        // bypass the JSON cast on `value` and the observer that invalidates the
        // cached settings blob, leaving the site serving the previous image
        // until the cache happened to expire.
        $setting = Setting::query()->firstOrNew(['key' => $slot->target]);

        $setting->fill([
            'value' => $mediaId,
            'group' => $setting->group ?? 'home',
            'is_public' => $setting->exists ? $setting->is_public : true,
        ]);

        $setting->save();
    }

    /**
     * @return list<SiteImageSlot>
     */
    public function slotsByKey(): array
    {
        $keyed = [];

        foreach ($this->slots() as $slot) {
            $keyed[$slot->key] = $slot;
        }

        return $keyed;
    }

    /**
     * Media records for every assigned slot, so the screen can show a thumbnail
     * of what is actually in place without a query per row.
     *
     * @param  array<string, int|null>  $current
     * @return Collection<int, Media>
     */
    public function mediaFor(array $current): Collection
    {
        $ids = array_values(array_filter($current, static fn (?int $id): bool => $id !== null));

        return $ids === []
            ? collect()
            : Media::query()->whereIn('id', $ids)->get()->keyBy('id');
    }

    /**
     * @return Collection<string, Page>
     */
    private function pagesByTemplate(): Collection
    {
        $templates = array_values(array_map(
            static fn (SiteImageSlot $slot): string => $slot->target,
            array_filter($this->slots(), static fn (SiteImageSlot $slot): bool => $slot->source === 'page'),
        ));

        return Page::query()->whereIn('template', $templates)->get()->keyBy(
            static fn (Page $page): string => $page->template->value,
        );
    }

    /**
     * @return list<string>
     */
    private function settingKeys(): array
    {
        return array_values(array_map(
            static fn (SiteImageSlot $slot): string => $slot->target,
            array_filter($this->slots(), static fn (SiteImageSlot $slot): bool => $slot->source === 'setting'),
        ));
    }

    /**
     * Settings are cast to array, so a stored scalar comes back as one. An
     * unset value is null rather than 0, so an empty slot reads as empty rather
     * than as a reference to a media record that does not exist.
     */
    private function toId(mixed $value): ?int
    {
        if (is_array($value)) {
            $value = $value[0] ?? null;
        }

        return is_numeric($value) ? (int) $value : null;
    }
}
