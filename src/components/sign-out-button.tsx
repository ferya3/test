import { logoutAction } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">
        Sign out
      </button>
    </form>
  );
}
