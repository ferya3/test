'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { login, verifyCode, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { submitWithoutReset } from '@/lib/form';

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <ErrorBox message={state.error} />
      <div>
        <Label htmlFor="email">ایمیل</Label>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="username" required autoFocus />
      </div>
      <div>
        <Label htmlFor="password">رمز عبور</Label>
        <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        ورود
      </Button>
    </form>
  );
}

export function VerifyForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(verifyCode, {});

  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <ErrorBox message={state.error} />
      <div>
        <Label htmlFor="code">کد ۶ رقمی</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          maxLength={7}
          className="text-center font-mono text-2xl tracking-[0.5em]"
          required
          autoFocus
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        تأیید
      </Button>
    </form>
  );
}
