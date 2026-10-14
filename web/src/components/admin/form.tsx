'use client';

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError, Label } from '@/components/ui/input';
import type { ActionState } from '@/lib/actions/types';
import { cn } from '@/lib/utils';
import { submitWithoutReset } from '@/lib/form';

const ErrorsContext = createContext<Record<string, string>>({});

/**
 * A form posting to a server action, with the action's field errors handed
 * down to every <Field> inside it and a status line for the overall result.
 */
export function AdminForm({
  action,
  children,
  submitLabel = 'ذخیره',
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [shown, setShown] = useState(false);
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.message) return;
    setShown(true);
    status.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <ErrorsContext.Provider value={state.errors ?? {}}>
      <form
        action={formAction}
        onSubmit={submitWithoutReset(formAction)}
        className={cn('grid gap-5', className)}
      >
        {children}

        <div ref={status} className="flex flex-wrap items-center gap-4 border-t border-ink-100 pt-5">
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
          {shown && state.message && (
            <p
              role="status"
              className={cn('flex items-center gap-2 text-sm font-medium', state.ok ? 'text-green-700' : 'text-red-700')}
            >
              {state.ok ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              {state.message}
            </p>
          )}
        </div>
      </form>
    </ErrorsContext.Provider>
  );
}

/** A labelled field; shows the error the action returned for `name`. */
export function Field({
  name,
  id,
  label,
  hint,
  children,
  className,
}: {
  name: string;
  /** The input's id, when it is not simply `name`. */
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const errors = useContext(ErrorsContext);

  return (
    <div className={className}>
      <Label htmlFor={id ?? name}>{label}</Label>
      {children}
      {hint && !errors[name] && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      <FieldError message={errors[name]} />
    </div>
  );
}
