<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Resources;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use App\Support\Enums\RoleName;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * User and role administration.
 *
 * Reserved for Super Admin by the permission matrix: an Admin who could grant
 * roles could grant themselves Super Admin, which would make the distinction
 * between the two meaningless.
 */
class UserController extends Controller
{
    public function index(): View
    {
        $this->authorize('viewAny', User::class);

        return view('admin.users.index', [
            'users' => User::query()->with('roles')->orderBy('name')->paginate(25),
        ]);
    }

    public function create(): View
    {
        $this->authorize('create', User::class);

        return view('admin.users.form', [
            'user' => new User,
            'roles' => RoleName::cases(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers()->symbols()->uncompromised()],
            'role' => ['required', Rule::in(RoleName::values())],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $user = new User([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        $user->password = $validated['password'];
        $user->email_verified_at = now();
        $user->save();

        $user->syncRoles([$validated['role']]);

        return redirect()
            ->route('admin.users.edit', $user)
            ->with('status', __('admin.saved'));
    }

    public function edit(User $user): View
    {
        $this->authorize('update', $user);

        return view('admin.users.form', [
            'user' => $user,
            'roles' => RoleName::cases(),
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $this->authorize('update', $user);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->getKey())],
            // Optional: an edit that leaves it blank must not blank the password.
            'password' => ['nullable', 'confirmed', Password::min(12)->letters()->numbers()->symbols()->uncompromised()],
            'role' => ['required', Rule::in(RoleName::values())],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $isSelf = $user->is($request->user());

        $user->fill([
            'name' => $validated['name'],
            'email' => $validated['email'],
            // Locking yourself out of the panel is not a recoverable mistake
            // from inside the panel.
            'is_active' => $isSelf ? true : (bool) ($validated['is_active'] ?? false),
        ]);

        if (filled($validated['password'] ?? null)) {
            $user->password = $validated['password'];
        }

        $user->save();

        // Likewise, demoting yourself would remove the ability to undo it.
        if (! $isSelf) {
            $user->syncRoles([$validated['role']]);
        }

        return redirect()
            ->route('admin.users.edit', $user)
            ->with('status', __('admin.saved'));
    }

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $this->authorize('delete', $user);

        if ($user->is($request->user())) {
            return back()->withErrors(['delete' => __('admin.cannot_delete_self')]);
        }

        $user->delete();

        return redirect()->route('admin.users.index')->with('status', __('admin.deleted'));
    }

    /**
     * Clear another account's two-factor enrolment, for the case where someone
     * has genuinely lost their device and their recovery codes.
     */
    public function resetTwoFactor(Request $request, User $user, TwoFactorService $twoFactor): RedirectResponse
    {
        $this->authorize('update', $user);

        $twoFactor->disable($user);

        return back()->with('status', __('admin.two_factor_reset'));
    }
}
