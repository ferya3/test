"use client";

import { useActionState, useState } from "react";
import { createDealAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

type Prefill = {
  listingId: string;
  sellerEmail: string;
  title: string;
  description: string;
  amount: string;
};

export function NewDealForm({
  prefill,
  feePercent,
  minAmount,
  maxAmount,
  defaultRefundAddress,
}: {
  prefill?: Prefill;
  feePercent: number;
  minAmount: string;
  maxAmount: string;
  defaultRefundAddress: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createDealAction, {});
  const [amount, setAmount] = useState(prefill?.amount ?? "");

  const parsed = Number(amount.replace(/,/g, ""));
  const fee = Number.isFinite(parsed) && parsed > 0 ? (parsed * feePercent) / 100 : 0;

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {prefill && <input type="hidden" name="listingId" value={prefill.listingId} />}

      <Field
        label="Seller's account email"
        htmlFor="sellerEmail"
        error={state.errors?.sellerEmail}
        hint="They need an EscrowBridge account before you can open the deal."
      >
        <input
          id="sellerEmail"
          name="sellerEmail"
          type="email"
          className="input"
          defaultValue={prefill?.sellerEmail}
          readOnly={Boolean(prefill)}
          required
        />
      </Field>

      <Field label="What is being sold?" htmlFor="title" error={state.errors?.title}>
        <input id="title" name="title" className="input" defaultValue={prefill?.title} maxLength={120} required />
      </Field>

      <Field
        label="Terms of the deal"
        htmlFor="description"
        error={state.errors?.description}
        hint="Spell out exactly what the seller hands over: account, email access, recovery codes, transfer steps."
      >
        <textarea
          id="description"
          name="description"
          className="textarea"
          defaultValue={prefill?.description}
          maxLength={4000}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount (USDT)"
          htmlFor="amount"
          error={state.errors?.amount}
          hint={`Between ${minAmount} and ${maxAmount} USDT.`}
        >
          <input
            id="amount"
            name="amount"
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="250.00"
            required
          />
        </Field>

        <Field
          label="Inspection window"
          htmlFor="inspectionHours"
          error={state.errors?.inspectionHours}
          hint="How long you get to test the account after delivery before funds auto-release."
        >
          <select id="inspectionHours" name="inspectionHours" className="select" defaultValue="48">
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
            <option value="168">7 days</option>
          </select>
        </Field>
      </div>

      <Field
        label="Your refund address (TRC-20)"
        htmlFor="refundAddress"
        error={state.errors?.refundAddress}
        hint="Where the USDT goes if the deal is refunded. Must be a TRON address you control."
      >
        <input
          id="refundAddress"
          name="refundAddress"
          className="input font-mono"
          defaultValue={defaultRefundAddress}
          placeholder="T…"
          spellCheck={false}
          required
        />
      </Field>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
        <div className="flex justify-between text-slate-400">
          <span>You pay into escrow</span>
          <span className="font-semibold text-slate-100">{amount || "0"} USDT</span>
        </div>
        <div className="mt-1 flex justify-between text-slate-500">
          <span>Platform fee ({feePercent.toFixed(2)}%, paid by the seller)</span>
          <span>{fee.toFixed(2)} USDT</span>
        </div>
      </div>

      <SubmitButton pendingLabel="Opening deal…">Open deal &amp; get deposit address</SubmitButton>
    </form>
  );
}
