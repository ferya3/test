'use client';

import { useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { submitLead, type LeadState } from '@/lib/actions/leads';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Textarea } from '@/components/ui/input';
import { submitWithoutReset } from '@/lib/form';
import { useLocale } from '@/i18n/client';

export function LeadForm({ kind, product, dark = false }: { kind: 'contact' | 'quote'; product?: string; dark?: boolean }) {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitLead, { ok: false });
  const v = state.values ?? {};
  const { t, locale } = useLocale();
  const label = dark ? 'text-ink-200' : undefined;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.ok ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 py-10 text-center"
          role="status"
        >
          <CheckCircle2 className="size-12 text-gold-500" />
          <p className={dark ? 'text-lg font-bold text-paper' : 'text-lg font-bold text-ink-950'}>{state.message}</p>
        </motion.div>
      ) : (
        <motion.form key="form" action={action} onSubmit={submitWithoutReset(action)} className="relative grid gap-4 sm:grid-cols-2" noValidate exit={{ opacity: 0 }}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="locale" value={locale} />
          {product && <input type="hidden" name="product" value={product} />}
          {/* Honeypot — hidden from people and from screen readers. */}
          <div aria-hidden className="absolute -start-[9999px] size-px overflow-hidden">
            <label>
              {t.form.website}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div>
            <Label htmlFor={`${kind}-name`} className={label}>
              {t.form.name}
            </Label>
            <Input id={`${kind}-name`} name="name" defaultValue={v.name} required maxLength={80} autoComplete="name" aria-invalid={!!state.errors?.name} />
            <FieldError message={state.errors?.name} />
          </div>

          <div>
            <Label htmlFor={`${kind}-phone`} className={label}>
              {t.form.phone}
            </Label>
            <Input
              id={`${kind}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="text-end"
              defaultValue={v.phone}
              required
              maxLength={20}
              autoComplete="tel"
              aria-invalid={!!state.errors?.phone}
            />
            <FieldError message={state.errors?.phone} />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor={`${kind}-email`} className={label}>
              {t.form.email} <span className="text-ink-400">{t.form.optional}</span>
            </Label>
            <Input
              id={`${kind}-email`}
              name="email"
              type="email"
              dir="ltr"
              className="text-end"
              defaultValue={v.email}
              maxLength={120}
              autoComplete="email"
              aria-invalid={!!state.errors?.email}
            />
            <FieldError message={state.errors?.email} />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor={`${kind}-message`} className={label}>
              {kind === 'quote' ? t.form.quoteMessage : t.form.message}
            </Label>
            <Textarea id={`${kind}-message`} name="message" defaultValue={v.message} maxLength={2000} aria-invalid={!!state.errors?.message} />
            <FieldError message={state.errors?.message} />
          </div>

          {state.message && !state.ok && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {state.message}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              {kind === 'quote' ? t.form.sendQuote : t.form.sendMessage}
            </Button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
