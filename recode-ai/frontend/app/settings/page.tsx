"use client";

import { CheckCircle2, Cpu, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiKeys } from "@/components/settings/api-keys";
import { Badge, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Meta, Role } from "@/lib/types";

export default function SettingsPage() {
  return (
    <AppShell>
      <SystemSettings />
    </AppShell>
  );
}

function SystemSettings() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const loadMeta = () => api.meta().then(setMeta).catch(() => undefined);
  useEffect(() => {
    void loadMeta();
  }, []);
  if (!meta)
    return (
      <div className="grid h-60 place-items-center">
        <Spinner />
      </div>
    );
  const ok = (v: boolean) => (v ? <CheckCircle2 className="size-4 text-good" /> : <XCircle className="size-4 text-bad" />);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">
          Your API keys and the models your projects use. Each project can override models, QA target and fix
          rounds in its own Settings tab.
        </p>
      </div>

      <ApiKeys onChanged={loadMeta} />

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="size-4 text-accent" />
          <p className="font-medium">Model routing for your projects</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-faint">
            <tr>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Provider</th>
              <th className="pb-2 font-medium">Model</th>
              <th className="pb-2 font-medium">Effort</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(meta.roles) as [Role, Meta["roles"][Role]][]).map(([role, cfg]) => (
              <tr key={role} className="border-t border-line">
                <td className="py-2 capitalize">{role}</td>
                <td className="py-2">
                  {cfg.offline ? <Badge tone="warn">offline</Badge> : <Badge tone="good">{cfg.provider}</Badge>}
                </td>
                <td className="py-2 font-mono text-xs text-muted">{cfg.offline ? "computer vision" : cfg.model}</td>
                <td className="py-2 text-muted">{cfg.provider === "anthropic" && !cfg.offline ? (cfg.effort ?? "—") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 space-y-1.5 text-sm">
          {Object.entries(meta.providers).map(([name, p]) => (
            <li key={name} className="flex items-center gap-2">
              {ok(p.available)}{" "}
              <span>{name === "openai" ? "OpenAI-compatible" : name === "heuristic" ? "Offline (computer vision)" : "Anthropic"}</span>
              <span className="text-xs text-faint">
                {name === "heuristic" ? "always available" : p.own_key ? "your key" : p.available ? "server key" : "not configured"}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent" />
          <p className="font-medium">Execution & limits</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">Build sandbox</dt>
          <dd className="flex items-center gap-2">
            {ok(meta.sandbox.available)} {meta.sandbox.mode}
          </dd>
          <dt className="text-muted">QA target score</dt>
          <dd className="tabular-nums">{meta.defaults.qa_threshold}</dd>
          <dt className="text-muted">Auto-fix rounds</dt>
          <dd className="tabular-nums">{meta.defaults.max_fix_iterations}</dd>
          <dt className="text-muted">Max upload</dt>
          <dd className="tabular-nums">{meta.defaults.max_upload_mb} MB</dd>
          <dt className="text-muted">Max video length</dt>
          <dd className="tabular-nums">{meta.defaults.max_video_seconds}s</dd>
        </dl>
      </Card>
    </div>
  );
}
