"use client";

import { useState, useTransition } from "react";
import { confirmItemAction, revealCredentialAction } from "@/app/actions/deals";
import { Card } from "./ui";

export type VaultItem = {
  id: string;
  label: string;
  kind: string;
  revealCount: number;
  purged: boolean;
  confirmed: boolean;
  rejected: boolean;
  rejectedNote: string | null;
};

const KIND_LABELS: Record<string, string> = {
  USERNAME: "Username",
  PASSWORD: "Password",
  EMAIL: "Email",
  RECOVERY: "Recovery code",
  SECRET: "Secret",
  NOTE: "Note",
};

export function CredentialVault({
  credentials,
  canReveal,
  canConfirm,
  lockedReason,
}: {
  credentials: VaultItem[];
  canReveal: boolean;
  canConfirm: boolean;
  lockedReason: string;
}) {
  const confirmed = credentials.filter((item) => item.confirmed).length;
  const rejected = credentials.filter((item) => item.rejected).length;
  const total = credentials.length;
  const allConfirmed = confirmed === total;

  return (
    <Card
      title="Credential vault"
      description={
        canReveal
          ? "Encrypted at rest. Every reveal is recorded on the deal's audit trail."
          : lockedReason
      }
      action={
        canConfirm ? (
          <span
            className={`badge ${
              allConfirmed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : rejected > 0
                  ? "border-red-500/40 bg-red-500/10 text-red-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {confirmed} of {total} confirmed
            {rejected > 0 && ` · ${rejected} rejected`}
          </span>
        ) : undefined
      }
    >
      {canConfirm && (
        <p className="mb-4 text-sm text-slate-400">
          Check each item as you verify it. Release the escrow only once every line below is green —
          {allConfirmed
            ? " which it now is."
            : " anything still outstanding is money you have not received value for."}
        </p>
      )}

      <ul className="space-y-3">
        {credentials.map((credential) => (
          <VaultRow
            key={credential.id}
            credential={credential}
            canReveal={canReveal}
            canConfirm={canConfirm}
          />
        ))}
      </ul>
    </Card>
  );
}

function VaultRow({
  credential,
  canReveal,
  canConfirm,
}: {
  credential: VaultItem;
  canReveal: boolean;
  canConfirm: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealCredentialAction(credential.id);
      if (result.error) setError(result.error);
      else setValue(result.value ?? "");
    });
  }

  function submitVerdict(verdict: "CONFIRM" | "REJECT" | "RESET") {
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("credentialId", credential.id);
      data.set("verdict", verdict);
      if (verdict === "REJECT") data.set("note", reason);

      const result = await confirmItemAction({}, data);
      if (result.errors) setError(Object.values(result.errors)[0]);
      else setRejecting(false);
    });
  }

  async function copy() {
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Your browser blocked clipboard access — select the text manually.");
    }
  }

  const border = credential.confirmed
    ? "border-emerald-500/40"
    : credential.rejected
      ? "border-red-500/40"
      : "border-slate-800";

  return (
    <li className={`rounded-xl border ${border} bg-slate-900/50 p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 truncate font-medium text-slate-200">
            {credential.label}
            {credential.confirmed && (
              <span className="badge border-emerald-500/40 bg-emerald-500/10 text-emerald-200">Confirmed</span>
            )}
            {credential.rejected && (
              <span className="badge border-red-500/40 bg-red-500/10 text-red-200">Not working</span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {KIND_LABELS[credential.kind] ?? credential.kind}
            {credential.revealCount > 0 && ` · viewed ${credential.revealCount}×`}
          </p>
        </div>

        {credential.purged ? (
          <span className="text-xs text-slate-500">Purged</span>
        ) : !canReveal ? (
          <span className="badge border-slate-600 bg-slate-800/60 text-slate-400">Locked</span>
        ) : value === null ? (
          <button type="button" className="btn btn-ghost" onClick={reveal} disabled={pending}>
            {pending ? "Decrypting…" : "Reveal"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setValue(null)}>
              Hide
            </button>
          </div>
        )}
      </div>

      {value !== null && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 font-mono text-sm text-emerald-100">
          {value}
        </pre>
      )}

      {credential.rejected && credential.rejectedNote && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-100">
          {credential.rejectedNote}
        </p>
      )}

      {canConfirm && !credential.purged && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          {credential.confirmed || credential.rejected ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => submitVerdict("RESET")}
              disabled={pending}
            >
              Undo
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => submitVerdict("CONFIRM")}
                disabled={pending}
              >
                This one works
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRejecting(!rejecting)}
                disabled={pending}
              >
                {rejecting ? "Cancel" : "Report a problem"}
              </button>
            </>
          )}
        </div>
      )}

      {rejecting && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="input max-w-md"
            placeholder="What is wrong with it? The operator and seller see this."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-label="Problem description"
          />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => submitVerdict("REJECT")}
            disabled={pending || reason.trim().length === 0}
          >
            Report
          </button>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
    </li>
  );
}
