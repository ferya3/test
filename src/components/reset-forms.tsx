"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, resetPasswordAction, type FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});

  // Once the request is in, the form is replaced: re-submitting achieves
  // nothing and the same message would only invite a second guess at whether
  // the address exists.
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <p className="text-sm text-slate-400">
          Nothing arrived? Check the spam folder, then{" "}
          <Link className="text-emerald-300 hover:underline" href="/forgot-password">
            try again
          </Link>
          .
        </p>
        <Link className="btn btn-ghost" href="/login">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <Field
        label="Email"
        htmlFor="email"
        error={state.errors?.email}
        hint="We send a link that works once and expires in an hour."
      >
        <input id="email" name="email" type="email" className="input" autoComplete="email" required autoFocus />
      </Field>

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>

      <p className="text-sm text-slate-400">
        Remembered it?{" "}
        <Link className="text-emerald-300 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <Field
        label="New password"
        htmlFor="newPassword"
        error={state.errors?.newPassword}
        hint="At least 10 characters, with a letter and a number."
      >
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field label="Repeat new password" htmlFor="confirmPassword" error={state.errors?.confirmPassword}>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>

      <p className="text-xs text-slate-500">
        Setting a new password signs the account out on every device.
      </p>
    </form>
  );
}
