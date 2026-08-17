<?php

declare(strict_types=1);

namespace App\Support\Data;

/**
 * One named, fixed image on the site.
 *
 * "Fixed" is the distinction that decides what belongs here. A product's
 * photograph belongs to that product and is edited on it; there are hundreds of
 * them and no screen could usefully list them all. A hero belongs to a *place* —
 * the top of the homepage, the top of the About page — and there is exactly one
 * of each. Those had no single home: the homepage hero had nowhere at all, and
 * the rest were spread across the forms of records whose names do not obviously
 * correspond to the pages they render.
 */
final readonly class SiteImageSlot
{
    /**
     * @param  string  $key  Stable identifier, used as the form field name.
     * @param  string  $label  What the operator calls this image.
     * @param  string  $location  Where on the site it appears, in plain words.
     * @param  string  $guidance  Dimensions or framing advice; empty when none.
     * @param  'setting'|'page'  $source  Where the value is stored.
     * @param  string  $target  Setting key, or PageTemplate value.
     */
    public function __construct(
        public string $key,
        public string $label,
        public string $location,
        public string $guidance,
        public string $source,
        public string $target,
    ) {}
}
