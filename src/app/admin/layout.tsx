import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/treasury", label: "Treasury" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // A signed-out visitor is simply asked to sign in — an admin following a
  // bookmark should not be told the page does not exist.
  if (!user) redirect(`/login?next=${encodeURIComponent("/admin")}`);
  // A signed-in non-admin gets 404 rather than 403, so the console stays
  // invisible to anyone who has no business knowing it exists.
  if (user.role !== "ADMIN") notFound();

  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
