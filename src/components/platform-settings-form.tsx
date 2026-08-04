"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function PlatformSettingsForm(props: {
  feeBasisPoints: number;
  minDeal: string;
  maxDeal: string;
  minWithdrawal: string;
  paymentWindowMins: number;
  requiredConfirmations: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateSettingsAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Escrow fee (basis points)"
          htmlFor="feeBasisPoints"
          error={state.errors?.feeBasisPoints}
          hint="500 = 5.00%, added on top of the sale price and paid by the buyer."
        >
          <input
            id="feeBasisPoints"
            name="feeBasisPoints"
            type="number"
            min={0}
            max={2000}
            className="input"
            defaultValue={props.feeBasisPoints}
          />
        </Field>

        <Field
          label="Payment window (minutes)"
          htmlFor="paymentWindowMins"
          error={state.errors?.paymentWindowMins}
          hint="How long a buyer has to send the USDT before the deal expires."
        >
          <input
            id="paymentWindowMins"
            name="paymentWindowMins"
            type="number"
            min={15}
            max={10080}
            className="input"
            defaultValue={props.paymentWindowMins}
          />
        </Field>

        <Field label="Minimum deal (USDT)" htmlFor="minDeal" error={state.errors?.minDeal}>
          <input id="minDeal" name="minDeal" className="input" defaultValue={props.minDeal} />
        </Field>

        <Field label="Maximum deal (USDT)" htmlFor="maxDeal" error={state.errors?.maxDeal}>
          <input id="maxDeal" name="maxDeal" className="input" defaultValue={props.maxDeal} />
        </Field>

        <Field
          label="Minimum withdrawal (USDT)"
          htmlFor="minWithdrawal"
          error={state.errors?.minWithdrawal}
          hint="Below this, network fees eat too much of the transfer."
        >
          <input id="minWithdrawal" name="minWithdrawal" className="input" defaultValue={props.minWithdrawal} />
        </Field>

        <Field
          label="Required confirmations"
          htmlFor="requiredConfirmations"
          error={state.errors?.requiredConfirmations}
          hint="Block confirmations before a deposit counts as final."
        >
          <input
            id="requiredConfirmations"
            name="requiredConfirmations"
            type="number"
            min={1}
            max={200}
            className="input"
            defaultValue={props.requiredConfirmations}
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}
