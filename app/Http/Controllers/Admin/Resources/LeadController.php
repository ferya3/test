<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Controller;
use App\Models\CatalogRequest;
use App\Models\ContactRequest;
use App\Support\Enums\ContactRequestType;
use App\Support\Enums\LeadStatus;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Lead triage.
 *
 * Leads arrive from the public site and are never authored here, which is why
 * the permission matrix issues no create ability for them — only view, update
 * (status) and delete.
 */
class LeadController extends Controller
{
    public function index(Request $request): View
    {
        $this->authorize('viewAny', ContactRequest::class);

        $type = ContactRequestType::tryFrom((string) $request->string('type'));
        $status = LeadStatus::tryFrom((string) $request->string('status'));

        return view('admin.leads.index', [
            'leads' => ContactRequest::query()
                ->with(['product:id,slug,name', 'handler:id,name'])
                ->when($type !== null, fn ($query) => $query->ofType($type))
                ->when($status !== null, fn ($query) => $query->withStatus($status))
                ->latestFirst()
                ->paginate(25)
                ->withQueryString(),
            'types' => ContactRequestType::cases(),
            'statuses' => LeadStatus::cases(),
            'activeType' => $type,
            'activeStatus' => $status,
        ]);
    }

    public function show(ContactRequest $lead): View
    {
        $this->authorize('view', $lead);

        $lead->load(['product:id,slug,name', 'handler:id,name']);

        return view('admin.leads.show', ['lead' => $lead]);
    }

    public function update(Request $request, ContactRequest $lead): RedirectResponse
    {
        $this->authorize('update', $lead);

        $validated = $request->validate([
            'status' => ['required', Rule::enum(LeadStatus::class)],
        ]);

        // Records who acted and when, so triage is attributable.
        $lead->markHandledBy($request->user(), LeadStatus::from($validated['status']));

        return back()->with('status', __('admin.saved'));
    }

    public function destroy(ContactRequest $lead): RedirectResponse
    {
        $this->authorize('delete', $lead);

        $lead->delete();

        return redirect()->route('admin.leads.index')->with('status', __('admin.deleted'));
    }

    public function catalogRequests(Request $request): View
    {
        $this->authorize('viewAny', CatalogRequest::class);

        return view('admin.leads.catalog-requests', [
            'requests' => CatalogRequest::query()
                ->with(['catalog:id,slug,title', 'handler:id,name'])
                ->latestFirst()
                ->paginate(25),
        ]);
    }

    public function updateCatalogRequest(Request $request, CatalogRequest $catalogRequest): RedirectResponse
    {
        $this->authorize('update', $catalogRequest);

        $validated = $request->validate([
            'status' => ['required', Rule::enum(LeadStatus::class)],
        ]);

        $catalogRequest->markHandledBy($request->user(), LeadStatus::from($validated['status']));

        return back()->with('status', __('admin.saved'));
    }
}
