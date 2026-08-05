"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initial: FormState = {};

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <Field label="Display name" htmlFor="displayName" error={state.errors?.displayName}>
        <input id="displayName" name="displayName" className="input" autoComplete="nickname" required />
      </Field>

      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={state.errors?.password}
        hint="At least 10 characters, with a letter and a number."
      >
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required />
      </Field>

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>

      <p className="text-sm text-slate-400">
        Already registered?{" "}
        <Link className="text-emerald-300 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ next, justReset }: { next?: string; justReset?: boolean }) {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {justReset && !state.errors && (
        <Alert tone="success">Your password has been changed. Sign in with the new one.</Alert>
      )}
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" error={state.errors?.password}>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </Field>

      <div className="flex justify-end">
        <Link className="text-sm text-slate-400 hover:text-emerald-300" href="/forgot-password">
          Forgot your password?
        </Link>
      </div>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <p className="text-sm text-slate-400">
        No account yet?{" "}
        <Link className="text-emerald-300 hover:underline" href="/register">
          Create one
        </Link>
      </p>
    </form>
  );
}
