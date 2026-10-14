import type { ReactNode } from 'react';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 bg-[radial-gradient(ellipse_at_top,rgb(184_137_58/0.25),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-[var(--shadow-lift)] sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-500 text-xl font-black text-ink-950">
          آ
        </span>
        <h1 className="mt-5 text-center text-h3 font-black text-ink-950">{title}</h1>
        <p className="mt-1 mb-6 text-center text-sm text-ink-600">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
