import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: {
    default: "EscrowBridge — USDT escrow for digital goods",
    template: "%s · EscrowBridge",
  },
  description:
    "EscrowBridge holds the buyer's USDT and the seller's account credentials until both sides of the trade are satisfied.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="font-sans">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0b1020]/85 backdrop-blur">
            <SiteNav user={user ? { role: user.role } : null} signOut={<SignOutButton />} />
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

          <footer className="border-t border-slate-800/80 py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-500">
              <p>© {new Date().getFullYear()} EscrowBridge. Escrow settled in USDT.</p>
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
                <Link className="hover:text-slate-300" href="/imprint">
                  Imprint
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
