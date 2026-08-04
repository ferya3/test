"use client";

import { useActionState, useState } from "react";
import { adjustBalanceAction } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { NETWORKS } from "@/lib/networks";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function AdjustBalanceForm({
  userId,
  currentBalance,
}: {
  userId: string;
  currentBalance: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(adjustBalanceAction, {});
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Direction" htmlFor="direction">
          <select
            id="direction"
            name="direction"
            className="select"
            value={direction}
            onChange={(event) => setDirection(event.target.value as "CREDIT" | "DEBIT")}
          >
            <option value="CREDIT">Credit — add to their balance</option>
            <option value="DEBIT">Debit — take from their balance</option>
          </select>
        </Field>

        <Field
          label="Amount (USDT)"
          htmlFor="amount"
          error={state.errors?.amount}
          hint={`Current balance: ${currentBalance} USDT`}
        >
          <input id="amount" name="amount" className="input" inputMode="decimal" placeholder="100.00" required />
        </Field>
      </div>

      <Field
        label="Reason"
        htmlFor="reason"
        error={state.errors?.reason}
        hint="Recorded on the ledger and shown to anyone auditing this account later."
      >
        <input
          id="reason"
          name="reason"
          className="input"
          placeholder="Sent USDT directly to the treasury wallet"
          maxLength={500}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Network it arrived on (optional)"
          htmlFor="network"
          error={state.errors?.network}
        >
          <select id="network" name="network" className="select" defaultValue="">
            <option value="">Not on-chain</option>
            {NETWORKS.map((network) => (
              <option key={network.value} value={network.value}>
                {network.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Sent from address (optional)"
          htmlFor="fromAddress"
          error={state.errors?.fromAddress}
          hint="The address the user paid from."
        >
          <input
            id="fromAddress"
            name="fromAddress"
            className="input font-mono"
            maxLength={80}
            spellCheck={false}
          />
        </Field>
      </div>

      <Field
        label="Transaction hash (optional)"
        htmlFor="reference"
        error={state.errors?.reference}
        hint="Anything that lets you find this deposit again on the explorer."
      >
        <input id="reference" name="reference" className="input font-mono" maxLength={120} spellCheck={false} />
      </Field>

      <SubmitButton
        className={`btn ${direction === "CREDIT" ? "btn-primary" : "btn-danger"}`}
        pendingLabel="Applying…"
        confirm={
          direction === "CREDIT"
            ? "Add this amount to the user's balance? The platform must actually hold the USDT."
            : "Take this amount off the user's balance?"
        }
      >
        {direction === "CREDIT" ? "Credit balance" : "Debit balance"}
      </SubmitButton>

      <p className="text-xs text-slate-500">
        Crediting a balance does not move any USDT — it records that the platform owes the user that much. Only credit
        funds the treasury has actually received.
      </p>
    </form>
  );
}
