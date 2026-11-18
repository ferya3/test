"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn, scoreTone } from "@/lib/utils";

/* ---------------------------------------------------------------- button */

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent/90 shadow-[0_0_0_1px_rgba(255,255,255,.08)_inset]",
        secondary: "bg-raised text-fg hover:bg-line border border-line",
        ghost: "text-muted hover:text-fg hover:bg-raised",
        danger: "bg-bad/10 text-bad hover:bg-bad/20 border border-bad/30",
        outline: "border border-line-strong text-fg hover:bg-raised",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-base",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});

/* ----------------------------------------------------------------- inputs */

const field =
  "w-full rounded-lg border border-line bg-panel-2 px-3 text-sm text-fg placeholder:text-faint transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(field, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(field, "py-2 leading-relaxed", className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "h-9 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("mb-1.5 flex items-baseline justify-between text-xs font-medium text-muted", className)}>
      <span>{children}</span>
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------ containers */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-panel", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-2 pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</h3>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      {icon && <div className="text-faint [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- feedback */

const badgeStyles = cva("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      neutral: "bg-raised text-muted",
      accent: "bg-accent/15 text-accent",
      good: "bg-good/15 text-good",
      warn: "bg-warn/15 text-warn",
      bad: "bg-bad/15 text-bad",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />;
}

export function ScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  const tone = scoreTone(score);
  if (tone === "none") return null;
  return (
    <Badge tone={tone === "good" ? "good" : tone === "ok" ? "warn" : "bad"} className={cn("tabular-nums", className)}>
      {score!.toFixed(1)}
    </Badge>
  );
}

const STATUS: Record<string, { tone: "neutral" | "accent" | "good" | "warn" | "bad"; label: string; busy?: boolean }> = {
  draft: { tone: "neutral", label: "Draft" },
  processing: { tone: "accent", label: "Processing media", busy: true },
  analyzing: { tone: "accent", label: "Analyzing", busy: true },
  generating: { tone: "accent", label: "Generating", busy: true },
  testing: { tone: "accent", label: "Testing", busy: true },
  ready: { tone: "good", label: "Ready" },
  failed: { tone: "bad", label: "Failed" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as const, label: status };
  return (
    <Badge tone={s.tone}>
      {s.busy && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-raised", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted", className)} />;
}

/* ------------------------------------------------------------------ tabs */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5",
            value === item.value ? "bg-raised text-fg" : "text-muted hover:text-fg",
          )}
        >
          {item.icon}
          {item.label}
          {item.badge}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-raised px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}
