"use client";

import Link from "next/link";
import { formatDayTime } from "@/lib/time";
import { useActionState, useState } from "react";
import {
  approveWithdrawalAction,
  markWithdrawalSentAction,
  rejectWithdrawalAction,
} from "@/app/actions/admin";
import type { FormState } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";

const TONE: Record<string, string> = {
  REQUESTED: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  APPROVED: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  SENT: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  REJECTED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export function WithdrawalRow(props: {
  id: string;
  userId: string;
  userLabel: string;
  amount: string;
  toAddress: string;
  explorerUrl: string;
  network: string;
  status: string;
  statusLabel: string;
  txHash: string | null;
  note: string | null;
  createdAt: string;
}) {
  const [rejectState, rejectAction] = useActionState<FormState, FormData>(rejectWithdrawalAction, {});
  const [rejecting, setRejecting] = useState(false);
  const open = ["REQUESTED", "APPROVED"].includes(props.status);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/admin/users/${props.userId}`} className="min-w-0 basis-full truncate sm:basis-0 sm:flex-1 text-sm text-slate-300 hover:text-emerald-300">
          {props.userLabel}
        </Link>
        <span className="text-sm font-semibold text-slate-100">{props.amount} USDT</span>
        <span className="text-xs text-slate-500">{props.network}</span>
        <span className={`badge ${TONE[props.status] ?? TONE.REJECTED}`}>{props.statusLabel}</span>
        <span className="w-28 text-right text-xs text-slate-500">
          {formatDayTime(props.createdAt)}
        </span>
      </div>

      <a
        className="mt-1 block break-all font-mono text-[11px] text-slate-500 hover:text-emerald-300"
        href={props.explorerUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        {props.toAddress}
      </a>

      {props.note && <p className="mt-1 text-xs text-slate-500">{props.note}</p>}
      {props.txHash && <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{props.txHash}</p>}

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {props.status === "REQUESTED" && (
              <form action={approveWithdrawalAction}>
                <input type="hidden" name="withdrawalId" value={props.id} />
                <SubmitButton className="btn btn-ghost">Approve</SubmitButton>
              </form>
            )}

            <form action={markWithdrawalSentAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="withdrawalId" value={props.id} />
              <input
                name="txHash"
                className="input max-w-md font-mono text-xs"
                placeholder="Transaction hash"
                required
                aria-label="Transaction hash"
              />
              <SubmitButton
                className="btn btn-primary"
                confirm="Confirm you have already broadcast this transfer from the treasury wallet."
              >
                Mark sent
              </SubmitButton>
            </form>

            <button type="button" className="btn btn-ghost" onClick={() => setRejecting(!rejecting)}>
              {rejecting ? "Cancel" : "Reject"}
            </button>
          </div>

          {rejecting && (
            <form action={rejectAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="withdrawalId" value={props.id} />
              <input
                name="reason"
                className="input max-w-md"
                placeholder="Reason — the user sees this"
                required
                aria-label="Rejection reason"
              />
              <SubmitButton
                className="btn btn-danger"
                confirm="Reject this withdrawal? The amount goes back onto the user's balance."
              >
                Reject &amp; refund balance
              </SubmitButton>
            </form>
          )}

          {rejectState.errors?.form && <p className="field-error">{rejectState.errors.form}</p>}
          {rejectState.errors?.reason && <p className="field-error">{rejectState.errors.reason}</p>}
        </div>
      )}
    </li>
  );
}
