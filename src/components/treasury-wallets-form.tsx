"use client";

import { useActionState } from "react";
import { setTreasuryWalletAction } from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

export type TreasuryRow = {
  network: string;
  label: string;
  address: string;
  note: string;
};

export function TreasuryWalletsForm({ wallets }: { wallets: TreasuryRow[] }) {
  return (
    <div className="space-y-6">
      {wallets.map((wallet) => (
        <WalletRow key={wallet.network} wallet={wallet} />
      ))}
    </div>
  );
}

function WalletRow({ wallet }: { wallet: TreasuryRow }) {
  const [state, action] = useActionState<FormState, FormData>(setTreasuryWalletAction, {});

  return (
    <form action={action} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <input type="hidden" name="network" value={wallet.network} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-200">{wallet.label}</p>
        <span
          className={`badge ${
            wallet.address
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-slate-600 bg-slate-800/60 text-slate-400"
          }`}
        >
          {wallet.address ? "Accepting deposits" : "Not set"}
        </span>
      </div>

      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Receiving address" htmlFor={`address-${wallet.network}`} error={state.errors?.address}>
          <input
            id={`address-${wallet.network}`}
            name="address"
            className="input font-mono text-xs"
            defaultValue={wallet.address}
            placeholder={wallet.network === "TRON" ? "T…" : "0x…"}
            spellCheck={false}
          />
        </Field>

        <Field label="Note (optional)" htmlFor={`note-${wallet.network}`} error={state.errors?.note}>
          <input
            id={`note-${wallet.network}`}
            name="note"
            className="input"
            defaultValue={wallet.note}
            placeholder="Which wallet this is"
            maxLength={200}
          />
        </Field>
      </div>

      <div className="mt-3">
        <SubmitButton className="btn btn-ghost" pendingLabel="Saving…">
          {wallet.address ? "Update address" : "Set address"}
        </SubmitButton>
      </div>
    </form>
  );
}
