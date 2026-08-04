"use client";

import { useActionState, useState } from "react";
import { deliverCredentialsAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { CREDENTIAL_KINDS } from "@/lib/validation";
import { Alert, Card } from "./ui";
import { SubmitButton } from "./submit-button";

const KIND_LABELS: Record<string, string> = {
  USERNAME: "Username",
  PASSWORD: "Password",
  EMAIL: "Email",
  RECOVERY: "Recovery code",
  SECRET: "Secret",
  NOTE: "Note",
};

const DEFAULT_ROWS = [
  { label: "Account username", kind: "USERNAME" },
  { label: "Password", kind: "PASSWORD" },
  { label: "Registered email", kind: "EMAIL" },
];

export function DeliveryForm({ dealId }: { dealId: string }) {
  const [state, action] = useActionState<FormState, FormData>(deliverCredentialsAction, {});
  const [rows, setRows] = useState(DEFAULT_ROWS);

  return (
    <Card
      title="Deliver the credentials"
      description="The buyer's USDT is in escrow. Hand over everything they need — it is encrypted the moment you submit."
    >
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="dealId" value={dealId} />

        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_9rem_1.6fr_2.5rem]">
            <input
              name="label"
              className="input"
              defaultValue={row.label}
              placeholder="Label"
              aria-label={`Item ${index + 1} label`}
            />
            <select name="kind" className="select" defaultValue={row.kind} aria-label={`Item ${index + 1} type`}>
              {CREDENTIAL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <input
              name="value"
              className="input font-mono"
              placeholder="Value"
              autoComplete="off"
              spellCheck={false}
              aria-label={`Item ${index + 1} value`}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
              aria-label={`Remove item ${index + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRows([...rows, { label: "", kind: "SECRET" }])}
          >
            Add item
          </button>
          <SubmitButton pendingLabel="Encrypting…">Deliver to buyer</SubmitButton>
        </div>

        <p className="pt-2 text-xs text-slate-500">
          Blank rows are ignored. Once delivered you cannot read these back — change the password on your side only
          after the deal completes.
        </p>
      </form>
    </Card>
  );
}
