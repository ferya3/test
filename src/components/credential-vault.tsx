"use client";

import { useState, useTransition } from "react";
import { revealCredentialAction } from "@/app/actions/deals";
import { Card } from "./ui";

type Item = {
  id: string;
  label: string;
  kind: string;
  revealCount: number;
  purged: boolean;
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
  lockedReason,
}: {
  credentials: Item[];
  canReveal: boolean;
  lockedReason: string;
}) {
  return (
    <Card
      title="Credential vault"
      description={
        canReveal
          ? "Encrypted at rest. Every reveal is recorded on the deal's audit trail."
          : lockedReason
      }
    >
      <ul className="space-y-3">
        {credentials.map((credential) => (
          <VaultRow key={credential.id} credential={credential} canReveal={canReveal} />
        ))}
      </ul>
    </Card>
  );
}

function VaultRow({ credential, canReveal }: { credential: Item; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealCredentialAction(credential.id);
      if (result.error) setError(result.error);
      else setValue(result.value ?? "");
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

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-200">{credential.label}</p>
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
      {error && <p className="field-error">{error}</p>}
    </li>
  );
}
