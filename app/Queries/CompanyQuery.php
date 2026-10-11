<?php

declare(strict_types=1);

namespace App\Queries;

use App\Models\Article;
use App\Models\Certificate;
use App\Models\Company;
use App\Models\Product;
use App\Models\Project;
use Illuminate\Support\Collection;

/**
 * Read paths for the holding: the list of subsidiaries, and everything a
 * subsidiary's own page shows. Owns the eager-load set for both, like the
 * other query objects, so the company page cannot grow an N+1 one section at a
 * time.
 */
class CompanyQuery
{
    /**
     * @var list<string>
     */
    public const array CARD_RELATIONS = ['logo', 'cover'];

    /**
     * @return Collection<int, Company>
     */
    public function listing(): Collection
    {
        return Company::query()
            ->active()
            ->with(self::CARD_RELATIONS)
            ->ordered()
            ->get();
    }

    /**
     * Group-wide figures for the holding's stat band, summed over the active
     * subsidiaries that report them. A figure nobody has entered is omitted
     * rather than shown as zero.
     *
     * Takes the listing the caller already loaded, so the totals cost nothing.
     *
     * @param  Collection<int, Company>  $companies
     * @return array{companies: int, employees: int|null, site_area_sqm: int|null}
     */
    public function totals(Collection $companies): array
    {
        $sum = static function (string $column) use ($companies): ?int {
            $values = $companies->pluck($column)->filter(static fn (mixed $v): bool => $v !== null);

            return $values->isEmpty() ? null : (int) $values->sum();
        };

        return [
            'companies' => $companies->count(),
            'employees' => $sum('employees'),
            'site_area_sqm' => $sum('site_area_sqm'),
        ];
    }

    /**
     * @return Collection<int, Product>
     */
    public function products(Company $company, int $limit = 8): Collection
    {
        return Product::query()
            ->published()
            ->forCompany($company)
            ->with(ProductQuery::CARD_RELATIONS)
            ->ordered()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Project>
     */
    public function projects(Company $company, int $limit = 3): Collection
    {
        return Project::query()
            ->active()
            ->forCompany($company)
            ->with(ProjectQuery::CARD_RELATIONS)
            ->ordered()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Certificate>
     */
    public function certificates(Company $company, int $limit = 6): Collection
    {
        return Certificate::query()
            ->active()
            ->valid()
            ->forCompany($company)
            ->with('image')
            ->ordered()
            ->limit($limit)
            ->get();
    }

    /**
     * @return Collection<int, Article>
     */
    public function articles(Company $company, int $limit = 3): Collection
    {
        return Article::query()
            ->published()
            ->forCompany($company)
            ->with(ArticleQuery::CARD_RELATIONS)
            ->latestFirst()
            ->limit($limit)
            ->get();
    }
}
