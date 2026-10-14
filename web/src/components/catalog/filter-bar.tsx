'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { num } from '@/lib/catalog';
import { useLocale } from '@/i18n/client';
import { cn } from '@/lib/utils';

export type FilterGroup = {
  param: string;
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: string[];
};

/**
 * Filters as dropdowns above the grid.
 *
 * State lives in the URL — `?family=wood&thickness=18` — so a filtered list
 * can be bookmarked, shared and reloaded, and the server renders exactly that
 * list. Choosing an option replaces the URL without scrolling; the page
 * re-renders on the server with the new products.
 */
export function FilterBar({ groups, total }: { groups: FilterGroup[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { t, locale } = useLocale();

  // Click outside or Escape closes the open panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function navigate(next: Record<string, string[]>) {
    const query = new URLSearchParams();
    for (const [param, values] of Object.entries(next)) {
      for (const value of values) query.append(param, value);
    }
    const qs = query.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const current = () => Object.fromEntries(groups.map((g) => [g.param, g.selected]));

  function toggle(param: string, value: string) {
    const state = current();
    const values = state[param] ?? [];
    state[param] = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
    navigate(state);
  }

  const chips = groups.flatMap((g) =>
    g.selected.map((value) => ({
      param: g.param,
      value,
      label: g.options.find((o) => o.value === value)?.label ?? value,
    })),
  );

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-ink-100 bg-paper/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-20 lg:-mx-8 lg:px-8">
      <div ref={bar} className="relative flex flex-wrap items-center gap-2">
        {groups.map((group) => (
          <Dropdown
            key={group.param}
            group={group}
            open={open === group.param}
            onOpenChange={(o) => setOpen(o ? group.param : null)}
            onToggle={(value) => toggle(group.param, value)}
          />
        ))}

        <p className="ms-auto flex items-center gap-2 text-sm text-ink-600" aria-live="polite">
          {pending && <Loader2 className="size-4 animate-spin text-gold-600" aria-hidden />}
          <span className="font-bold text-ink-950">{num(total, locale)}</span> {t.catalog.products}
        </p>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={`${chip.param}-${chip.value}`}
              type="button"
              onClick={() => toggle(chip.param, chip.value)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-950 ps-3 pe-2 text-xs text-paper transition-colors hover:bg-ink-800"
              aria-label={`${t.catalog.removeFilter}: ${chip.label}`}
            >
              {chip.label}
              <X className="size-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate({})}
            className="h-10 px-2 text-xs font-bold text-gold-700 underline-offset-4 hover:underline"
          >
            {t.catalog.clearAll}
          </button>
        </div>
      )}
    </div>
  );
}

function Dropdown({
  group,
  open,
  onOpenChange,
  onToggle,
}: {
  group: FilterGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (value: string) => void;
}) {
  const id = `filter-${group.param}`;
  const count = group.selected.length;
  const { locale } = useLocale();

  return (
    // Positioned only from `sm` up: on a phone the panel anchors to the whole
    // bar and spans its width, rather than hanging off a narrow button.
    <div className="flex-1 sm:relative sm:flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors sm:min-w-36 sm:px-4',
          count > 0 || open
            ? 'border-ink-950 bg-ink-950 text-paper'
            : 'border-ink-200 bg-white text-ink-800 hover:border-ink-400',
        )}
      >
        <span className="flex items-center gap-1.5">
          {group.label}
          {count > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-gold-400 text-[0.7rem] font-bold text-ink-950">
              {num(count, locale)}
            </span>
          )}
        </span>
        <ChevronDown className={cn('size-4 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="group"
            aria-label={group.label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 top-full z-40 mt-2 origin-top rounded-xl border border-ink-100 bg-white p-2 shadow-[var(--shadow-lift)] sm:inset-x-auto sm:start-0 sm:w-72"
            data-lenis-prevent
          >
            <ul className="max-h-80 overflow-y-auto">
              {group.options.map((option) => {
                const checked = group.selected.includes(option.value);
                const disabled = option.count === 0 && !checked;

                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={disabled}
                      onClick={() => onToggle(option.value)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-sm text-ink-800 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                          checked ? 'border-gold-500 bg-gold-400 text-ink-950' : 'border-ink-300 bg-white',
                        )}
                      >
                        {checked && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="flex-1">{option.label}</span>
                      <span className="text-xs text-ink-500 tabular-nums">{num(option.count, locale)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
