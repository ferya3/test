<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Queries\ProductQuery;
use App\Queries\ProjectQuery;
use App\Support\Enums\ProjectType;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ProjectController extends Controller
{
    public function index(Request $request, ProjectQuery $query): View
    {
        $type = $request->string('type')->toString() ?: null;
        $year = $request->integer('year') ?: null;

        return view('pages.projects.index', [
            'projects' => $query->paginate($type, $year),
            'types' => ProjectType::cases(),
            'years' => $query->years(),
            'activeType' => $type,
            'activeYear' => $year,
        ]);
    }

    public function show(Project $project, ProjectQuery $query): View
    {
        if (! $project->is_active) {
            throw new NotFoundHttpException;
        }

        $project->load([
            'cover',
            'gallery',
            'seo',
            'products' => fn ($q) => $q->published()->with(ProductQuery::CARD_RELATIONS),
        ]);

        return view('pages.projects.show', [
            'project' => $project,
            'related' => $query->related($project),
        ]);
    }
}
