"use client";

import { useActionState, useState } from "react";
import { openDisputeAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { Alert, Card, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function DisputeForm({ dealId }: { dealId: string }) {
  const [state, action] = useActionState<FormState, FormData>(openDisputeAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="text-sm text-slate-500">
        Something wrong with this deal?{" "}
        <button type="button" className="text-red-300 underline hover:text-red-200" onClick={() => setOpen(true)}>
          Open a dispute
        </button>
      </div>
    );
  }

  return (
    <Card
      title="Open a dispute"
      description="The deal freezes and a moderator reviews the thread. Escrowed funds stay put until they decide."
    >
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="dealId" value={dealId} />
        <Field label="What went wrong?" htmlFor="reason" error={state.errors?.reason}>
          <textarea
            id="reason"
            name="reason"
            className="textarea"
            placeholder="Describe the problem and what you have already tried with the other party."
            required
          />
        </Field>
        <div className="flex gap-2">
          <SubmitButton className="btn btn-danger" pendingLabel="Submitting…">
            Open dispute
          </SubmitButton>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
