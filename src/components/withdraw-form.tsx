"use client";

import { useActionState } from "react";
import { requestWithdrawalAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { NETWORKS } from "@/lib/networks";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function WithdrawForm({
  balance,
  minimum,
  defaultAddress,
  defaultNetwork,
}: {
  balance: string;
  minimum: string;
  defaultAddress: string;
  defaultNetwork: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(requestWithdrawalAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field
        label="Amount (USDT)"
        htmlFor="amount"
        error={state.errors?.amount}
        hint={`Available: ${balance} USDT · minimum ${minimum} USDT`}
      >
        <input id="amount" name="amount" className="input" inputMode="decimal" placeholder={minimum} required />
      </Field>

      <Field label="Network" htmlFor="network">
        <select id="network" name="network" className="select" defaultValue={defaultNetwork}>
          {NETWORKS.map((network) => (
            <option key={network.value} value={network.value}>
              {network.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Destination address"
        htmlFor="toAddress"
        error={state.errors?.toAddress}
        hint="Double-check it. Transfers cannot be reversed."
      >
        <input
          id="toAddress"
          name="toAddress"
          className="input font-mono"
          defaultValue={defaultAddress}
          spellCheck={false}
          required
        />
      </Field>

      <SubmitButton pendingLabel="Requesting…" confirm="Request this withdrawal? The amount leaves your balance now.">
        Request withdrawal
      </SubmitButton>
    </form>
  );
}
