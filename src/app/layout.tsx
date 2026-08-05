import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = {
  title: {
    default: "Sedo — USDT escrow for digital goods",
    template: "%s · Sedo",
  },
  description:
    "Sedo holds the buyer's USDT and the seller's account credentials until both sides of the trade are satisfied.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0b1020]/85 backdrop-blur">
            <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold text-slate-50">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400 text-sm font-bold text-emerald-950">
                  SD
                </span>
                Sedo
              </Link>

              <div className="ml-auto flex items-center gap-1 text-sm">
                <Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/60" href="/listings">
                  Marketplace
                </Link>
                <Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/60" href="/how-it-works">
                  How it works
                </Link>
                {user ? (
                  <>
                    <Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/60" href="/dashboard">
                      Dashboard
                    </Link>
                    {user.role === "ADMIN" && (
                      <Link className="rounded-lg px-3 py-2 text-amber-300 hover:bg-slate-800/60" href="/admin">
                        Admin
                      </Link>
                    )}
                    <SignOutButton />
                  </>
                ) : (
                  <>
                    <Link className="rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/60" href="/login">
                      Sign in
                    </Link>
                    <Link className="btn btn-primary" href="/register">
                      Create account
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

          <footer className="border-t border-slate-800/80 py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-500">
              <p>© {new Date().getFullYear()} Sedo. Escrow settled in USDT.</p>
              <div className="flex gap-4">
                <Link className="hover:text-slate-300" href="/how-it-works">
                  How it works
                </Link>
                <Link className="hover:text-slate-300" href="/terms">
                  Terms
                </Link>
                <Link className="hover:text-slate-300" href="/security">
                  Security
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
