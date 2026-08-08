<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Article;
use App\Models\CatalogRequest;
use App\Models\ContactRequest;
use App\Models\Product;
use App\Models\Project;
use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use Illuminate\Contracts\View\View;

class DashboardController extends Controller
{
    public function __invoke(): View
    {
        return view('admin.dashboard', [
            'stats' => [
                ['label' => __('admin.resources.products'), 'value' => Product::query()->published()->count()],
                ['label' => __('admin.resources.articles'), 'value' => Article::query()->published()->count()],
                ['label' => __('admin.resources.projects'), 'value' => Project::query()->active()->count()],
                ['label' => __('admin.open_leads'), 'value' => ContactRequest::query()->open()->count()],
            ],

            // The panel exists mostly to answer "what came in and what needs
            // doing", so open leads lead the page rather than vanity counts.
            'recentLeads' => ContactRequest::query()
                ->with('product:id,slug,name')
                ->open()
                ->latestFirst()
                ->limit(8)
                ->get(),

            'recentCatalogRequests' => CatalogRequest::query()
                ->with('catalog:id,slug,title')
                ->open()
                ->latestFirst()
                ->limit(5)
                ->get(),

            'leadsByType' => ContactRequest::query()
                ->selectRaw('type, count(*) as aggregate')
                ->where('status', LeadStatus::New)
                ->groupBy('type')
                ->pluck('aggregate', 'type')
                ->mapWithKeys(fn (int $count, string $type): array => [
                    ContactRequestType::from($type)->label() => $count,
                ])
                ->all(),
        ]);
    }
}
