import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, LogOut } from 'lucide-react';
import { AdminNav } from '@/components/admin/nav';
import { requireAdmin } from '@/lib/session';
import { logout } from '@/lib/actions/auth';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: { default: 'پنل مدیریت', template: '%s | پنل مدیریت' },
  robots: { index: false, follow: false },
};

/**
 * Every admin page renders inside this layout, and this layout refuses to
 * render without a fully signed-in administrator. It runs on the Node
 * runtime, where the session table is readable — middleware runs on the Edge
 * and cannot open SQLite. Each server action checks again on its own, since
 * an action can be called without the page being rendered.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const { n: unread } = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE is_read = 0').get() as { n: number };

  return (
    <div className="min-h-dvh bg-ink-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 z-30 bg-ink-950 px-4 pt-4 pb-3 text-paper lg:h-dvh lg:p-5">
        <div className="mb-4 flex items-center justify-between lg:mb-8">
          <Link href="/admin" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed PNG */}
            <img src="/brand/mark-light.png" alt="" width={54} height={36} className="h-9 w-auto" />
            <span className="font-bold">پنل مدیریت</span>
          </Link>
          <form action={logout} className="lg:hidden">
            <button type="submit" className="grid size-10 place-items-center rounded-lg text-ink-300 hover:bg-white/5" aria-label="خروج">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>

        <AdminNav unread={unread} />

        <div className="mt-8 hidden border-t border-white/10 pt-5 text-sm lg:block">
          <p className="truncate text-ink-300">{user.name}</p>
          <p className="ltr-isolate truncate text-xs text-ink-400">{user.email}</p>
          <div className="mt-4 flex flex-col gap-1">
            <Link href="/" target="_blank" className="flex items-center gap-2 rounded-lg px-3 py-2 text-ink-300 hover:bg-white/5">
              <ExternalLink className="size-4" />
              مشاهدهٔ سایت
            </Link>
            <form action={logout}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-ink-300 hover:bg-white/5">
                <LogOut className="size-4" />
                خروج
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
