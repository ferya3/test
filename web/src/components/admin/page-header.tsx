import type { ReactNode } from 'react';

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div>
        <h1 className="text-h2 font-black text-ink-950">{title}</h1>
        {description && <p className="mt-1 text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
