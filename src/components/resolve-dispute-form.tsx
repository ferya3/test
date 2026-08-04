"use client";

import { useActionState } from "react";
import { resolveDisputeAction } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function ResolveDisputeForm({ dealId }: { dealId: string }) {
  const [state, action] = useActionState<FormState, FormData>(resolveDisputeAction, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="dealId" value={dealId} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field label="Outcome" htmlFor={`outcome-${dealId}`} error={state.errors?.outcome}>
        <select id={`outcome-${dealId}`} name="outcome" className="select" defaultValue="REFUND_BUYER">
          <option value="REFUND_BUYER">Refund the buyer</option>
          <option value="RELEASE_TO_SELLER">Release to the seller</option>
        </select>
      </Field>

      <Field
        label="Decision notes"
        htmlFor={`resolution-${dealId}`}
        error={state.errors?.resolution}
        hint="Both parties see this on the deal page."
      >
        <textarea id={`resolution-${dealId}`} name="resolution" className="textarea" required />
      </Field>

      <SubmitButton pendingLabel="Resolving…" confirm="Resolve this dispute? Funds will move accordingly.">
        Resolve dispute
      </SubmitButton>
    </form>
  );
}
