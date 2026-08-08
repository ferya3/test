<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Queries\ProductQuery;
use App\Queries\ProjectQuery;
use App\Services\Seo\SchemaGenerator;
use App\Services\Seo\SeoManager;
use App\Support\Enums\ProjectType;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ProjectController extends Controller
{
    public function index(Request $request, ProjectQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        $type = $request->string('type')->toString() ?: null;
        $year = $request->integer('year') ?: null;

        return view('pages.projects.index', [
            'projects' => $query->paginate($type, $year),
            'types' => ProjectType::cases(),
            'years' => $query->years(),
            'activeType' => $type,
            'activeYear' => $year,
            'seo' => $seo->forPage(
                routeName: 'projects.index',
                title: __('pages.projects.heading'),
                description: __('pages.projects.lead'),
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }

    public function show(Project $project, ProjectQuery $query, SeoManager $seo, SchemaGenerator $schema): View
    {
        if (! $project->is_active) {
            throw new NotFoundHttpException;
        }

        $project->load([
            'cover',
            'gallery',
            'seo.ogImage',
            'products' => fn ($q) => $q->published()->with(ProductQuery::CARD_RELATIONS),
        ]);

        return view('pages.projects.show', [
            'project' => $project,
            'related' => $query->related($project),
            'seo' => $seo->forModel(
                model: $project,
                routeName: 'projects.show',
                routeParams: ['project' => $project->slug],
                fallbackTitle: $project->title,
                fallbackDescription: $project->summary ?: Str::limit(strip_tags((string) $project->body), 160),
                fallbackImage: $project->cover,
                structuredData: $schema->graph([$schema->organization(), $schema->website()]),
            ),
        ]);
    }
}
