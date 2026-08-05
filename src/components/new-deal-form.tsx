"use client";

import { useActionState, useState } from "react";
import { createDealAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { NETWORKS, type Network } from "@/lib/networks";
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
  const [network, setNetwork] = useState<Network>("TRON");

  // The fee sits on top of the price, so the buyer funds price + fee.
  const parsed = Number(amount.replace(/,/g, ""));
  const price = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const fee = (price * feePercent) / 100;

  return (
    <form action={action} className="space-y-4">
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {prefill && <input type="hidden" name="listingId" value={prefill.listingId} />}

      <Field
        label="Seller's account email"
        htmlFor="sellerEmail"
        error={state.errors?.sellerEmail}
        hint="They need an Sedo account before you can open the deal."
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
          label="Sale price (USDT)"
          htmlFor="amount"
          error={state.errors?.amount}
          hint={`What the seller receives. Between ${minAmount} and ${maxAmount} USDT.`}
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

        <Field label="Network" htmlFor="network" error={state.errors?.network}>
          <select
            id="network"
            name="network"
            className="select"
            value={network}
            onChange={(event) => setNetwork(event.target.value as Network)}
          >
            {NETWORKS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
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
        label="Your refund address"
        htmlFor="refundAddress"
        error={state.errors?.refundAddress}
        hint={`Where the USDT goes if the deal is refunded. Must be an address you control on ${
          NETWORKS.find((item) => item.value === network)?.label ?? network
        }.`}
      >
        <input
          id="refundAddress"
          name="refundAddress"
          className="input font-mono"
          defaultValue={defaultRefundAddress}
          placeholder={network === "TRON" ? "T…" : "0x…"}
          spellCheck={false}
          required
        />
      </Field>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
        <div className="flex justify-between text-slate-400">
          <span>Seller receives</span>
          <span>{price > 0 ? price.toFixed(2) : "0.00"} USDT</span>
        </div>
        <div className="mt-1 flex justify-between text-slate-500">
          <span>Platform fee ({feePercent.toFixed(2)}%)</span>
          <span>+ {fee.toFixed(2)} USDT</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-800 pt-2 text-slate-300">
          <span className="font-medium">You fund into escrow</span>
          <span className="font-semibold text-slate-100">{(price + fee).toFixed(2)} USDT</span>
        </div>
      </div>

      <SubmitButton pendingLabel="Opening deal…">Open deal &amp; get deposit address</SubmitButton>
    </form>
  );
}
