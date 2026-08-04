"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Network } from "@/lib/wallet";
import { Card } from "./ui";

export function PaymentPanel({
  amount,
  address,
  network,
  expiresAt,
  isBuyer,
}: {
  amount: string;
  address: string;
  network: Network;
  expiresAt: string;
  isBuyer: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<"address" | "amount" | null>(null);
  const [remaining, setRemaining] = useState(() => msLeft(expiresAt));

  useEffect(() => {
    const tick = setInterval(() => setRemaining(msLeft(expiresAt)), 1000);
    return () => clearInterval(tick);
  }, [expiresAt]);

  // The chain watcher funds the deal server-side; poll so the page flips over
  // on its own once the transfer confirms.
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(poll);
  }, [router]);

  async function copy(text: string, which: "address" | "amount") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the value is selectable on screen */
    }
  }

  return (
    <Card
      title={isBuyer ? "Send the USDT to fund escrow" : "Waiting for the buyer's payment"}
      description={
        isBuyer
          ? "This address belongs to this deal only. Send the exact amount over the network shown below."
          : "You will be asked for the credentials as soon as the funds confirm on-chain."
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
          <p className="mt-1 text-2xl font-semibold text-slate-50">{amount} USDT</p>
          <button type="button" className="btn btn-ghost mt-3" onClick={() => copy(amount, "amount")}>
            {copied === "amount" ? "Copied" : "Copy amount"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Deposit address · {network === "TRON" ? "TRC-20" : "ERC-20"}
          </p>
          <p className="mt-1 break-all font-mono text-sm text-slate-200">{address}</p>
          <button type="button" className="btn btn-ghost mt-3" onClick={() => copy(address, "address")}>
            {copied === "address" ? "Copied" : "Copy address"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-semibold">
          {remaining > 0 ? `Payment window closes in ${formatRemaining(remaining)}` : "The payment window has closed."}
        </p>
        <p className="mt-1 text-amber-200/80">
          Send only USDT on the {network === "TRON" ? "TRON (TRC-20)" : "Ethereum (ERC-20)"} network. Any other token or
          network will not be credited and cannot be recovered.
        </p>
      </div>
    </Card>
  );
}

function msLeft(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
