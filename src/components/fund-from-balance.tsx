"use client";

import Link from "next/link";
import { useActionState } from "react";
import { fundFromBalanceAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { Alert, Card } from "./ui";
import { SubmitButton } from "./submit-button";

export function FundFromBalance({
  dealId,
  balance,
  amount,
  sufficient,
}: {
  dealId: string;
  balance: string;
  amount: string;
  sufficient: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(fundFromBalanceAction, {});

  return (
    <Card
      title="…or pay from your balance"
      description="Funds the deal instantly, with no waiting for an on-chain confirmation."
    >
      {state.errors?.form && <Alert tone="error">{state.errors.form}</Alert>}
      {state.ok && <Alert tone="success">{state.message}</Alert>}

      <p className="text-sm text-slate-400">
        Your balance: <span className="font-semibold text-slate-100">{balance} USDT</span> · this deal needs{" "}
        <span className="font-semibold text-slate-100">{amount} USDT</span>
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="dealId" value={dealId} />
        <SubmitButton
          pendingLabel="Funding…"
          confirm={`Pay ${amount} USDT from your balance into escrow?`}
        >
          Fund from balance
        </SubmitButton>
      </form>

      {!sufficient && (
        <p className="mt-3 text-xs text-slate-500">
          Not enough on your balance — send the USDT to the deposit address above, or{" "}
          <Link href="/dashboard/wallet" className="text-emerald-300 hover:underline">
            check your wallet
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
