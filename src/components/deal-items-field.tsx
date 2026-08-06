"use client";

import { useState } from "react";

type Row = { key: number; label: string; amount: string };

let nextKey = 0;
const blankRow = (): Row => ({ key: (nextKey += 1), label: "", amount: "" });

/**
 * Optional itemisation of what is being bought. A lot of five assets sold for
 * one price is still one escrow, but the buyer's invoice reads far better when
 * it names each thing — and the running total tells them before they submit
 * whether the lines match the price they typed.
 */
export function DealItemsField({ price, error }: { price: number; error?: string }) {
  const [rows, setRows] = useState<Row[]>([blankRow()]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const total = rows.reduce((sum, row) => {
    const value = Number(row.amount.replace(/,/g, ""));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const used = rows.some((row) => row.label.trim());
  const priced = rows.filter((row) => row.amount.trim()).length;
  const labelled = rows.filter((row) => row.label.trim()).length;
  // Sub-cent drift from decimal input is not a mismatch worth shouting about.
  const matches = Math.abs(total - price) < 0.000001;

  return (
    <fieldset className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <legend className="px-2 text-sm font-semibold text-slate-300">Line items (optional)</legend>
      <p className="mb-3 text-xs text-slate-500">
        List what makes up this deal and it appears on the invoice. Amounts are optional — leave them blank for a
        lot sold at one price. If you do price them, every line needs an amount and they must add up to the sale
        price.
      </p>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.key} className="flex gap-2">
            <input
              name="itemLabel"
              className="input flex-1"
              placeholder={index === 0 ? "Instagram @handle" : "Description"}
              value={row.label}
              maxLength={200}
              onChange={(event) => update(row.key, { label: event.target.value })}
              aria-label={`Item ${index + 1} description`}
            />
            <input
              name="itemAmount"
              className="input w-32"
              inputMode="decimal"
              placeholder="optional"
              value={row.amount}
              onChange={(event) => update(row.key, { amount: event.target.value })}
              aria-label={`Item ${index + 1} amount`}
            />
            <button
              type="button"
              className="btn btn-ghost px-3"
              onClick={() => setRows((current) => (current.length === 1 ? [blankRow()] : current.filter((r) => r.key !== row.key)))}
              aria-label={`Remove item ${index + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost" onClick={() => setRows((current) => [...current, blankRow()])}>
          Add a line
        </button>

        {used && priced === 0 && (
          <span className="text-sm text-slate-500">Sold as one lot at {price.toFixed(2)} USDT</span>
        )}

        {used && priced > 0 && priced < labelled && (
          <span className="text-sm text-amber-400">
            {labelled - priced} line{labelled - priced === 1 ? "" : "s"} still {labelled - priced === 1 ? "needs" : "need"} an amount
          </span>
        )}

        {used && priced > 0 && priced === labelled && (
          <span className={`text-sm ${matches ? "text-emerald-400" : "text-amber-400"}`}>
            Lines total {total.toFixed(2)} USDT
            {matches ? " — matches the sale price" : ` · sale price is ${price.toFixed(2)}`}
          </span>
        )}
      </div>

      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
