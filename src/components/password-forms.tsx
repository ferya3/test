"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { adminSetPasswordAction } from "@/app/actions/admin";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

/** Meets the platform's rule: 10+ characters with a letter and a digit. */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field label="Current password" htmlFor="currentPassword" error={state.errors?.currentPassword}>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>

      <p className="text-xs text-slate-500">
        Changing your password signs you out of every other device, keeping this one.
      </p>
    </form>
  );
}

export function AdminSetPasswordForm({ userId, email }: { userId: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(adminSetPasswordAction, {});
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field
        label="New password"
        htmlFor="resetPassword"
        error={state.errors?.newPassword}
        hint="At least 10 characters, with a letter and a number."
      >
        <div className="flex flex-wrap gap-2">
          <input
            id="resetPassword"
            name="newPassword"
            type={revealed ? "text" : "password"}
            className="input font-mono"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={() => {
              setPassword(suggestPassword());
              setRevealed(true);
            }}
          >
            Generate
          </button>
        </div>
      </Field>

      {password && revealed && (
        <p className="text-xs text-slate-500">
          Copy this before you submit — it is not stored anywhere you can read it back.
        </p>
      )}

      <Field
        label="Reason"
        htmlFor="resetReason"
        error={state.errors?.reason}
        hint="Goes on the audit trail against your name."
      >
        <input
          id="resetReason"
          name="reason"
          className="input"
          placeholder="Lost access, verified by email"
          maxLength={500}
          required
        />
      </Field>

      <SubmitButton
        className="btn btn-danger"
        pendingLabel="Setting…"
        confirm={`Set a new password for ${email}? Every session they have will be signed out, and you will be able to sign in as them until they change it.`}
      >
        Set password
      </SubmitButton>

      <p className="text-xs text-slate-500">
        Anyone who knows a user&apos;s password can read their credential vault. Only do this when you have verified
        who you are talking to, and tell them to change it straight away.
      </p>
    </form>
  );
}
