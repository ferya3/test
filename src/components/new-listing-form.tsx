"use client";

import { useActionState } from "react";
import { createListingAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { CATEGORIES } from "@/lib/validation";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export function NewListingForm() {
  const [state, action] = useActionState<FormState, FormData>(createListingAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}

      <Field label="Title" htmlFor="title" error={state.errors?.title}>
        <input id="title" name="title" className="input" maxLength={120} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="category" error={state.errors?.category}>
          <select id="category" name="category" className="select" defaultValue="OTHER">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0) + category.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Price (USDT)" htmlFor="price" error={state.errors?.price}>
          <input id="price" name="price" className="input" inputMode="decimal" placeholder="250.00" required />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor="description"
        error={state.errors?.description}
        hint="Say what the buyer receives and how the handover works. Never put passwords here — those go in the vault after the deal is funded."
      >
        <textarea id="description" name="description" className="textarea" maxLength={4000} required />
      </Field>

      <SubmitButton pendingLabel="Publishing…">Publish listing</SubmitButton>
    </form>
  );
}
