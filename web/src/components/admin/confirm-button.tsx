'use client';

import type { ReactNode } from 'react';

/** A destructive submit button that asks first. */
export function ConfirmButton({ message, children }: { message: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="flex h-11 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm text-red-700 hover:bg-red-50"
    >
      {children}
    </button>
  );
}
