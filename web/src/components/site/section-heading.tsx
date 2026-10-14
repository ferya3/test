import { cn } from '@/lib/utils';

export function SectionHeading({
  overline,
  title,
  lead,
  align = 'start',
  dark = false,
  className,
}: {
  overline?: string;
  title: string;
  lead?: string;
  align?: 'start' | 'center';
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {overline && (
        <p className={cn('mb-3 text-sm font-bold tracking-wide', dark ? 'text-gold-300' : 'text-gold-700')}>
          {overline}
        </p>
      )}
      <h2 className={cn('text-h2 font-black text-balance', dark ? 'text-paper' : 'text-ink-950')}>{title}</h2>
      {lead && <p className={cn('mt-4 text-lead', dark ? 'text-ink-300' : 'text-ink-600')}>{lead}</p>}
    </div>
  );
}
