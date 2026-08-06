"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavUser = { role: string } | null;

const LINK = "rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/60";

/**
 * The navigation was a single non-wrapping row, so on a 390px phone it ran to
 * about 536px and the browser zoomed the *whole site* out to fit it. Every page
 * looked shrunken as a result, which is what made the app feel broken on mobile.
 *
 * Below `sm` the links collapse behind a toggle; from `sm` up the original row
 * is unchanged.
 */
export function SiteNav({ user, signOut }: { user: NavUser; signOut: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A menu left open across a navigation covers the page you just asked for.
  useEffect(() => setOpen(false), [pathname]);

  const links = (
    <>
      <Link className={LINK} href="/listings">
        Marketplace
      </Link>
      <Link className={LINK} href="/how-it-works">
        How it works
      </Link>
      {user ? (
        <>
          <Link className={LINK} href="/dashboard">
            Dashboard
          </Link>
          {user.role === "ADMIN" && (
            <Link className="rounded-lg px-3 py-2 text-amber-300 hover:bg-slate-800/60" href="/admin">
              Admin
            </Link>
          )}
          {signOut}
        </>
      ) : (
        <>
          <Link className={LINK} href="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" href="/register">
            Create account
          </Link>
        </>
      )}
    </>
  );

  return (
    <>
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-50">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400 text-sm font-bold text-emerald-950">
            EB
          </span>
          EscrowBridge
        </Link>

        <div className="ml-auto hidden items-center gap-1 text-sm sm:flex">{links}</div>

        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-slate-800/60 sm:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div
          id="mobile-nav"
          className="flex flex-col items-stretch gap-1 border-t border-slate-800/80 px-4 pb-3 pt-2 text-sm sm:hidden [&_a]:block [&_button]:w-full [&_button]:text-left"
        >
          {links}
        </div>
      )}
    </>
  );
}
