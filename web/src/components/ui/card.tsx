import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const cardVariants = cva('relative flex flex-col overflow-hidden rounded-xl', {
  variants: {
    tone: {
      default: 'border border-ink-100 bg-white shadow-[var(--shadow-soft)]',
      subtle: 'bg-ink-50',
      dark: 'bg-ink-900 text-paper',
    },
  },
  defaultVariants: { tone: 'default' },
});

export function Card({
  className,
  tone,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ tone }), className)} {...props} />;
}

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-gold-100 bg-gold-50 px-2.5 py-0.5 text-xs font-medium text-gold-700',
        className,
      )}
      {...props}
    />
  );
}
