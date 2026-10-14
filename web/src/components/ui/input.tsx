import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-lg border border-ink-300 bg-white px-4 text-base text-ink-900 placeholder:text-ink-400 ' +
  'transition-colors focus-visible:border-gold-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-100 ' +
  'aria-[invalid=true]:border-red-600 disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, 'h-12', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'min-h-32 resize-y py-3', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(field, 'h-12', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-2 block text-sm font-medium text-ink-800', className)} {...props} />;
}

/** A field's error, announced by screen readers when it appears. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-1.5 text-sm text-red-700">
      {message}
    </p>
  );
}
