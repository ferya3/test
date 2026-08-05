"use client";

import { useActionState } from "react";
import { updateCompanyAction } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function CompanyDetailsForm(props: {
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyCountry: string;
  companyEmail: string;
  companyRegistration: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateCompanyAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field label="Trading name" htmlFor="companyName" error={state.errors?.companyName}>
        <input id="companyName" name="companyName" className="input" defaultValue={props.companyName} required />
      </Field>

      <Field
        label="Street and number"
        htmlFor="companyStreet"
        error={state.errors?.companyStreet}
        hint="Must be an address where post actually reaches you."
      >
        <input id="companyStreet" name="companyStreet" className="input" defaultValue={props.companyStreet} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Postal code" htmlFor="companyPostalCode" error={state.errors?.companyPostalCode}>
          <input
            id="companyPostalCode"
            name="companyPostalCode"
            className="input"
            defaultValue={props.companyPostalCode}
          />
        </Field>
        <Field label="City" htmlFor="companyCity" error={state.errors?.companyCity}>
          <input id="companyCity" name="companyCity" className="input" defaultValue={props.companyCity} />
        </Field>
        <Field label="Country" htmlFor="companyCountry" error={state.errors?.companyCountry}>
          <input id="companyCountry" name="companyCountry" className="input" defaultValue={props.companyCountry} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email" htmlFor="companyEmail" error={state.errors?.companyEmail}>
          <input id="companyEmail" name="companyEmail" className="input" defaultValue={props.companyEmail} />
        </Field>
        <Field
          label="Registration / VAT number"
          htmlFor="companyRegistration"
          error={state.errors?.companyRegistration}
          hint="e.g. HRB 12345 B, or your VAT ID."
        >
          <input
            id="companyRegistration"
            name="companyRegistration"
            className="input"
            defaultValue={props.companyRegistration}
          />
        </Field>
      </div>

      <SubmitButton className="btn btn-primary" pendingLabel="Saving…">
        Save company details
      </SubmitButton>
    </form>
  );
}
