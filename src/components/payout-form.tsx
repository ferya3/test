"use client";

import { useActionState } from "react";
import { savePayoutAddressAction } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function PayoutAddressForm({
  defaultAddress,
  defaultNetwork,
}: {
  defaultAddress: string;
  defaultNetwork: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(savePayoutAddressAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field label="Network" htmlFor="payoutNetwork">
        <select id="payoutNetwork" name="payoutNetwork" className="select" defaultValue={defaultNetwork}>
          <option value="TRON">TRON (TRC-20)</option>
          <option value="ETHEREUM">Ethereum (ERC-20)</option>
        </select>
      </Field>

      <Field label="USDT address" htmlFor="payoutAddress" error={state.errors?.payoutAddress}>
        <input
          id="payoutAddress"
          name="payoutAddress"
          className="input font-mono"
          defaultValue={defaultAddress}
          spellCheck={false}
          required
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save payout address</SubmitButton>
    </form>
  );
}
