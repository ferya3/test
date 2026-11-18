"use client";

import { CheckCircle2, KeyRound, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { ProviderCredential, ProviderId, ProviderTest } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "openrouter", label: "OpenRouter", base_url: "https://openrouter.ai/api/v1", model: "google/gemini-2.5-pro" },
  { id: "openai", label: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o" },
  {
    id: "gemini",
    label: "Google Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-pro",
  },
  { id: "ollama", label: "Ollama (local)", base_url: "http://localhost:11434/v1", model: "qwen2.5vl" },
  { id: "custom", label: "Other OpenAI-compatible service", base_url: "", model: "" },
];

function Status({ cred, test }: { cred: ProviderCredential | undefined; test: ProviderTest | null }) {
  if (!cred?.configured) return <Badge>not set</Badge>;
  const check = test ?? (cred.last_check.message ? { ok: !!cred.last_check.ok, message: cred.last_check.message } : null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="accent" className="font-mono">
        {cred.key_hint ?? "no key"}
      </Badge>
      {check && (
        <span className={cn("inline-flex items-center gap-1 text-xs", check.ok ? "text-good" : "text-bad")}>
          {check.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {check.message}
        </span>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  cred,
  onChange,
}: {
  provider: ProviderId;
  cred: ProviderCredential | undefined;
  onChange: (cred: ProviderCredential) => void;
}) {
  const isAnthropic = provider === "anthropic";
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(cred?.base_url ?? "");
  const [model, setModel] = useState(cred?.model ?? "");
  const [preset, setPreset] = useState("custom");
  const [advanced, setAdvanced] = useState(!!cred?.base_url && isAnthropic);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ProviderTest | null>(null);

  async function runTest() {
    setBusy("test");
    try {
      setTest(await api.testProvider(provider));
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : "Check failed", models: [] });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    setTest(null);
    try {
      const saved = await api.saveProvider(provider, {
        api_key: key || null,
        base_url: baseUrl || null,
        model: isAnthropic ? null : model || null,
      });
      onChange(saved);
      setKey("");
      setBusy(null);
      await runTest();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Remove this key? Your projects fall back to the server's key or offline mode.")) return;
    setBusy("delete");
    try {
      await api.deleteProvider(provider);
      onChange({ provider, configured: false, key_hint: null, base_url: null, model: null, last_check: {}, updated_at: null });
      setTest(null);
    } finally {
      setBusy(null);
    }
  }

  function applyPreset(id: string) {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && p.id !== "custom") {
      setBaseUrl(p.base_url);
      setModel(p.model);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{isAnthropic ? "Anthropic (Claude)" : "OpenAI-compatible service"}</p>
          <p className="text-sm text-muted">
            {isAnthropic
              ? "Your key from console.anthropic.com. Best results: Claude reads texts, fonts and behaviours."
              : "OpenRouter, OpenAI, Google Gemini, a local Ollama, or any service with an OpenAI-style API."}
          </p>
        </div>
        <Status cred={cred} test={test} />
      </div>

      {!isAnthropic && (
        <div>
          <Label>Service</Label>
          <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn(isAnthropic && "sm:col-span-2")}>
          <Label hint={cred?.configured ? "leave empty to keep the saved key" : undefined}>API key</Label>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={cred?.configured ? "••••••••  (saved)" : isAnthropic ? "sk-ant-..." : "sk-..."}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        {!isAnthropic && (
          <div>
            <Label hint="must support images for the vision role">Model</Label>
            <Input
              list={`${provider}-models`}
              placeholder="e.g. google/gemini-2.5-pro"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id={`${provider}-models`}>
              {(test?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        )}
        {(!isAnthropic || advanced) && (
          <div className="sm:col-span-2">
            <Label hint={isAnthropic ? "only for an Anthropic-compatible relay" : undefined}>Base URL</Label>
            <Input
              type="url"
              placeholder={isAnthropic ? "https://api.anthropic.com" : "https://openrouter.ai/api/v1"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        )}
      </div>
      {isAnthropic && !advanced && (
        <button className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline" onClick={() => setAdvanced(true)}>
          Use a relay / custom endpoint
        </button>
      )}

      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={busy === "save"} disabled={!cred?.configured && !key}>
          <KeyRound /> {cred?.configured ? "Update" : "Save & test"}
        </Button>
        {cred?.configured && (
          <>
            <Button variant="secondary" onClick={runTest} loading={busy === "test"}>
              Test connection
            </Button>
            <Button variant="danger" onClick={remove} loading={busy === "delete"}>
              <Trash2 /> Remove
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function ApiKeys({ onChanged }: { onChanged?: () => void }) {
  const [creds, setCreds] = useState<ProviderCredential[] | null>(null);
  const [preferred, setPreferred] = useState<ProviderId | null>(null);

  useEffect(() => {
    api.providers().then(setCreds).catch(() => setCreds([]));
    api
      .accountSettings()
      .then((s) => setPreferred(s.preferred_provider ?? null))
      .catch(() => undefined);
  }, []);

  if (!creds)
    return (
      <div className="grid h-40 place-items-center">
        <Spinner />
      </div>
    );

  const update = (cred: ProviderCredential) => {
    setCreds((cs) => (cs ?? []).map((c) => (c.provider === cred.provider ? cred : c)));
    onChanged?.();
  };
  const configured = creds.filter((c) => c.configured).map((c) => c.provider);

  async function choose(provider: ProviderId) {
    setPreferred(provider);
    await api.saveAccountSettings({ preferred_provider: provider });
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Your API keys</h2>
        <p className="text-sm text-muted">
          Keys are stored encrypted, only used for your own projects, and never shown again after saving. Your
          usage is billed by the provider to your account.
        </p>
      </div>
      {(["anthropic", "openai"] as ProviderId[]).map((p) => (
        <ProviderCard key={p} provider={p} cred={creds.find((c) => c.provider === p)} onChange={update} />
      ))}
      {configured.length > 1 && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <p className="text-sm font-medium">Use by default</p>
          {configured.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-muted">
              <input type="radio" name="preferred" checked={(preferred ?? configured[0]) === p} onChange={() => choose(p)} />
              {p === "anthropic" ? "Anthropic (Claude)" : "OpenAI-compatible"}
            </label>
          ))}
          <span className="text-xs text-faint">Each project can still choose per role in its Settings tab.</span>
        </Card>
      )}
    </div>
  );
}
