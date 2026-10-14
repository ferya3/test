import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap select-none',
    'transition-[background-color,color,box-shadow,transform,border-color] duration-300 ease-[var(--ease-out-expo)]',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:size-[1.1em] [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        // Gold surface, dark text — 8.8:1. White on gold fails AA.
        gold: 'bg-gold-400 text-ink-950 shadow-[var(--shadow-gold)] hover:bg-gold-300',
        dark: 'bg-ink-950 text-paper hover:bg-ink-800',
        outline: 'border border-ink-300 bg-transparent text-ink-900 hover:border-ink-900 hover:bg-ink-50',
        // For dark bands: a light hairline that reads on charcoal.
        ghostLight: 'border border-white/25 text-paper hover:border-white/60 hover:bg-white/10',
        ghost: 'text-ink-900 hover:bg-ink-50',
        link: 'h-auto px-0 text-gold-700 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-sm',
        lg: 'h-13 px-8 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'gold', size: 'md' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (typically a Link) with the button's styling. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
