<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Queries\CompanyQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The holding's subsidiaries: one index, one page per company.
 */
class CompanyController extends Controller
{
    public function index(CompanyQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        $companies = $query->listing();

        return view('pages.companies.index', [
            'companies' => $companies,
            'totals' => $query->totals($companies),
            'seo' => $seo->forPage(
                routeName: 'companies.index',
                title: __('pages.companies.heading'),
                description: __('pages.companies.lead'),
                structuredData: $schema->graph([
                    $schema->organization($companies),
                    $schema->website(),
                ]),
            ),
        ]);
    }

    public function show(Company $company, CompanyQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        if (! $company->is_active) {
            throw new NotFoundHttpException;
        }

        $company->load(['logo', 'cover', 'seo.ogImage']);

        $canonical = $seo->canonicalFor($company, 'companies.show', ['company' => $company->slug]);

        return view('pages.companies.show', [
            'company' => $company,
            'products' => $query->products($company),
            'projects' => $query->projects($company),
            'certificates' => $query->certificates($company),
            'articles' => $query->articles($company),
            'siblings' => $query->listing()->reject(fn (Company $c): bool => $c->is($company))->values(),
            'seo' => $seo->forModel(
                model: $company,
                routeName: 'companies.show',
                routeParams: ['company' => $company->slug],
                fallbackTitle: $company->name,
                fallbackDescription: $company->summary ?: Str::limit(strip_tags((string) $company->body), 160),
                fallbackImage: $company->cover,
                structuredData: $schema->graph([
                    $schema->organization(),
                    $schema->website(),
                    $schema->subsidiary($company, $canonical),
                ]),
            ),
        ]);
    }
}
