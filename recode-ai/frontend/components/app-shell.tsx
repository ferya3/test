"use client";

import { LayoutGrid, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Spinner } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-[13px] font-bold text-white">
        R
      </span>
      <span>
        Recode <span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  if (loading || !user) {
    return (
      <div className="grid h-screen place-items-center">
        <Spinner />
      </div>
    );
  }
  const nav = [
    { href: "/", label: "Projects", icon: <LayoutGrid /> },
    { href: "/settings", label: "Settings", icon: <Settings /> },
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm [&_svg]:size-4",
                  pathname === item.href ? "bg-raised text-fg" : "text-muted hover:text-fg",
                )}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
            <button onClick={signOut} className="text-muted hover:text-fg" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
