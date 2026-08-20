<?php

declare(strict_types=1);

namespace App\Support\Data;

use Illuminate\Http\Request;

/**
 * The catalogue filter state, parsed once from the query string.
 *
 * Values are attribute *slugs* (and thickness values), never ids — the URL is a
 * shareable, readable, indexable artefact, and slugs survive a re-seed.
 *
 * Nothing here is trusted: every list is normalised to unique, non-empty
 * strings, and the query object binds them as parameters.
 */
final readonly class ProductFilters
{
    public const array SORTS = ['latest', 'oldest', 'name', 'code'];

    public const int PER_PAGE = 24;

    public const int MAX_PER_PAGE = 60;

    /**
     * @param  list<string>  $categories
     * @param  list<string>  $colors
     * @param  list<string>  $decors
     * @param  list<string>  $decorFamilies
     * @param  list<string>  $surfaces
     * @param  list<string>  $materials
     * @param  list<string>  $applications
     * @param  list<string>  $thicknesses
     */
    public function __construct(
        public array $categories = [],
        public array $colors = [],
        public array $decors = [],
        // The catalogue's one public filter. Kept beside the others rather
        // than replacing them: the remaining dimensions are still queryable by
        // URL and still used by the admin, they are simply not offered.
        public array $decorFamilies = [],
        public array $surfaces = [],
        public array $materials = [],
        public array $applications = [],
        public array $thicknesses = [],
        public ?string $search = null,
        public string $sort = 'latest',
        public int $perPage = self::PER_PAGE,
    ) {}

    public static function fromRequest(Request $request): self
    {
        $sort = (string) $request->query('sort', 'latest');

        return new self(
            categories: self::list($request, 'category'),
            colors: self::list($request, 'color'),
            decors: self::list($request, 'decor'),
            decorFamilies: self::list($request, 'family'),
            surfaces: self::list($request, 'surface'),
            materials: self::list($request, 'material'),
            applications: self::list($request, 'application'),
            thicknesses: self::list($request, 'thickness'),
            search: self::search($request),
            sort: in_array($sort, self::SORTS, true) ? $sort : 'latest',
            perPage: self::perPage($request),
        );
    }

    /**
     * Filters as query-string parameters, for building links that preserve
     * state (sorting, pagination, language switching).
     *
     * Lists are joined with commas rather than left as arrays: http_build_query
     * would otherwise emit "surface%5B0%5D=high-gloss", which is neither
     * readable nor comfortably shareable. fromRequest() parses both forms.
     *
     * @return array<string, string>
     */
    public function toQuery(): array
    {
        return array_filter([
            'category' => implode(',', $this->categories),
            'color' => implode(',', $this->colors),
            'decor' => implode(',', $this->decors),
            'family' => implode(',', $this->decorFamilies),
            'surface' => implode(',', $this->surfaces),
            'material' => implode(',', $this->materials),
            'application' => implode(',', $this->applications),
            'thickness' => implode(',', $this->thicknesses),
            'q' => $this->search,
            'sort' => $this->sort === 'latest' ? null : $this->sort,
            'per_page' => $this->perPage === self::PER_PAGE ? null : (string) $this->perPage,
        ], static fn (?string $value): bool => $value !== null && $value !== '');
    }

    /**
     * The same filters with one value toggled — what a filter checkbox links to
     * so the control works without JavaScript.
     */
    public function toggle(string $key, string $value): self
    {
        $property = self::propertyFor($key);

        if ($property === null) {
            return $this;
        }

        $current = $this->{$property};
        $updated = in_array($value, $current, true)
            ? array_values(array_diff($current, [$value]))
            : [...$current, $value];

        return new self(...[
            ...$this->toArray(),
            $property => $updated,
        ]);
    }

    public function withSort(string $sort): self
    {
        return new self(...[
            ...$this->toArray(),
            'sort' => in_array($sort, self::SORTS, true) ? $sort : 'latest',
        ]);
    }

    public function cleared(): self
    {
        // Sorting and page size are display preferences, not filters, so a
        // "clear filters" action keeps them.
        return new self(sort: $this->sort, perPage: $this->perPage);
    }

    public function isActive(string $key, string $value): bool
    {
        $property = self::propertyFor($key);

        return $property !== null && in_array($value, $this->{$property}, true);
    }

    public function hasAny(): bool
    {
        return $this->categories !== []
            || $this->colors !== []
            || $this->decors !== []
            || $this->decorFamilies !== []
            || $this->surfaces !== []
            || $this->materials !== []
            || $this->applications !== []
            || $this->thicknesses !== []
            || $this->search !== null;
    }

    public function activeCount(): int
    {
        return count($this->categories)
            + count($this->colors)
            + count($this->decors)
            + count($this->decorFamilies)
            + count($this->surfaces)
            + count($this->materials)
            + count($this->applications)
            + count($this->thicknesses)
            + ($this->search !== null ? 1 : 0);
    }

    /**
     * A cache key fragment identifying this exact filter combination.
     */
    public function fingerprint(): string
    {
        $query = $this->toQuery();
        ksort($query);

        return md5(json_encode($query, JSON_THROW_ON_ERROR));
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'categories' => $this->categories,
            'colors' => $this->colors,
            'decors' => $this->decors,
            'decorFamilies' => $this->decorFamilies,
            'surfaces' => $this->surfaces,
            'materials' => $this->materials,
            'applications' => $this->applications,
            'thicknesses' => $this->thicknesses,
            'search' => $this->search,
            'sort' => $this->sort,
            'perPage' => $this->perPage,
        ];
    }

    /**
     * Query-string key to constructor property.
     */
    private static function propertyFor(string $key): ?string
    {
        return match ($key) {
            'category' => 'categories',
            'color' => 'colors',
            'decor' => 'decors',
            'family' => 'decorFamilies',
            'surface' => 'surfaces',
            'material' => 'materials',
            'application' => 'applications',
            'thickness' => 'thicknesses',
            default => null,
        };
    }

    /**
     * Accepts both repeated (?color=a&color=b) and comma separated (?color=a,b)
     * forms, because hand-edited and shared URLs use both.
     *
     * @return list<string>
     */
    private static function list(Request $request, string $key): array
    {
        $raw = $request->query($key);

        if ($raw === null) {
            return [];
        }

        $values = is_array($raw) ? $raw : explode(',', (string) $raw);

        $values = array_map(
            static fn ($value): string => trim((string) (is_scalar($value) ? $value : '')),
            $values,
        );

        // Cap the list so a crafted URL cannot build an unbounded IN clause.
        return array_values(array_slice(
            array_unique(array_filter($values, static fn (string $v): bool => $v !== '' && mb_strlen($v) <= 64)),
            0,
            25,
        ));
    }

    private static function search(Request $request): ?string
    {
        $term = trim((string) $request->query('q', ''));

        if ($term === '') {
            return null;
        }

        return mb_substr($term, 0, 80);
    }

    private static function perPage(Request $request): int
    {
        $value = (int) $request->query('per_page', self::PER_PAGE);

        return max(6, min($value, self::MAX_PER_PAGE));
    }
}
