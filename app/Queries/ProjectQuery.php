<?php

declare(strict_types=1);

namespace App\Queries;

use App\Models\Project;
use App\Support\Enums\ProjectType;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class ProjectQuery
{
    /**
     * @var list<string>
     */
    public const array CARD_RELATIONS = ['cover'];

    public function paginate(?string $type = null, ?int $year = null, int $perPage = 9): LengthAwarePaginator
    {
        return Project::query()
            ->active()
            ->when($this->validType($type), fn ($query, $value) => $query->where('project_type', $value))
            ->when($year !== null, fn ($query) => $query->where('year', $year))
            ->with(self::CARD_RELATIONS)
            ->ordered()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * @return Collection<int, Project>
     */
    public function featured(int $limit = 3): Collection
    {
        return Project::query()
            ->active()
            ->featured()
            ->with(self::CARD_RELATIONS)
            ->ordered()
            ->limit($limit)
            ->get();
    }

    /**
     * Distinct years that actually have projects, newest first — used to build
     * the year filter without offering empty options.
     *
     * @return list<int>
     */
    public function years(): array
    {
        return Project::query()
            ->active()
            ->whereNotNull('year')
            ->distinct()
            ->orderByDesc('year')
            ->pluck('year')
            ->map(static fn ($year): int => (int) $year)
            ->all();
    }

    /**
     * @return Collection<int, Project>
     */
    public function related(Project $project, int $limit = 3): Collection
    {
        return Project::query()
            ->active()
            ->whereKeyNot($project->getKey())
            ->when(
                $project->project_type !== null,
                fn ($query) => $query->where('project_type', $project->project_type),
            )
            ->with(self::CARD_RELATIONS)
            ->ordered()
            ->limit($limit)
            ->get();
    }

    private function validType(?string $type): ?string
    {
        return $type !== null && ProjectType::tryFrom($type) !== null ? $type : null;
    }
}
