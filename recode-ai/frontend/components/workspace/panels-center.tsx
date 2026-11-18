"use client";

import Editor, { loader } from "@monaco-editor/react";
import { AlertTriangle, CheckCircle2, ExternalLink, GitBranch, Laptop, Monitor, Package, RefreshCw, Save, Smartphone, Tablet, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Input, Label, ScoreBadge, SectionTitle, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { DesignSpec, Effort, Meta, Project, ProjectSettings, Role, TestResult } from "@/lib/types";
import { cn, downloadBlob, languageFor } from "@/lib/utils";

loader.config({ paths: { vs: "/monaco/vs" } });

/* ------------------------------------------------------------ preview */

const DEVICES = [
  { id: "desktop", icon: <Monitor />, width: null as number | null, label: "Recorded width" },
  { id: "laptop", icon: <Laptop />, width: 1280, label: "1280" },
  { id: "tablet", icon: <Tablet />, width: 768, label: "768" },
  { id: "mobile", icon: <Smartphone />, width: 390, label: "390" },
];

export function LivePreview({ projectId, versionId }: { projectId: string; versionId: string | null }) {
  const [preview, setPreview] = useState<{ url: string; ready: boolean; message: string | null } | null>(null);
  const [device, setDevice] = useState("desktop");
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) return;
    let alive = true;
    api
      .previewUrl(projectId, versionId)
      .then((p) => alive && setPreview(p))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [projectId, versionId]);

  if (!versionId) return <Empty icon={<Monitor />} title="Nothing to preview yet">Generate the project to see it running here.</Empty>;
  const width = DEVICES.find((d) => d.id === device)?.width;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            onClick={() => setDevice(d.id)}
            title={d.label}
            aria-label={`Preview at ${d.label}`}
            className={cn("grid size-7 place-items-center rounded-md [&_svg]:size-4", device === d.id ? "bg-raised text-fg" : "text-muted hover:text-fg")}
          >
            {d.icon}
          </button>
        ))}
        <span className="ml-2 truncate font-mono text-[11px] text-faint">{width ? `${width}px` : "100%"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setNonce((n) => n + 1)} aria-label="Reload preview">
            <RefreshCw />
          </Button>
          {preview && (
            <a href={preview.url} target="_blank" rel="noreferrer" aria-label="Open in a new tab">
              <Button size="icon" variant="ghost" tabIndex={-1}>
                <ExternalLink />
              </Button>
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[#0d0f14] p-3">
        {error && <p className="text-sm text-bad">{error}</p>}
        {preview && !preview.ready && <Empty icon={<Package />} title="Not built">{preview.message}</Empty>}
        {preview?.ready && (
          <iframe
            key={`${preview.url}-${nonce}`}
            src={preview.url}
            title="Live preview"
            // no allow-same-origin: generated code runs in an opaque origin
            sandbox="allow-scripts"
            className="mx-auto h-full min-h-[480px] rounded-md border border-line bg-white shadow-2xl transition-[width]"
            style={{ width: width ? `${width}px` : "100%" }}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- editor */

export function CodeEditor({
  path,
  value,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  path: string | null;
  value: string | null;
  dirty: number;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  if (!path) return <Empty title="Select a file">Pick a file in the explorer to read or edit it.</Empty>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted">{path}</span>
        <div className="ml-auto flex items-center gap-2">
          {dirty > 0 && <span className="text-xs text-warn">{dirty} unsaved file{dirty > 1 ? "s" : ""}</span>}
          <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty} loading={saving} onClick={onSave}>
            <Save /> Save as new version
          </Button>
        </div>
      </div>
      <div className="flex-1">
        {value === null ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : /\.(png|jpe?g|webp|gif|avif|ico)$/i.test(path) ? (
          <div className="checker grid h-full place-items-center overflow-auto p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={path} className="max-h-full max-w-full shadow-lg" />
          </div>
        ) : (
          <Editor
            path={path}
            value={value}
            language={languageFor(path)}
            theme="vs-dark"
            onChange={(v) => onChange(v ?? "")}
            loading={<Spinner />}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ visual QA */

export function QAPanel({ tests, onRerun, rerunning }: { tests: TestResult[]; onRerun: () => void; rerunning: boolean }) {
  const visual = tests.find((t) => t.kind === "visual");
  const security = tests.find((t) => t.kind === "security");
  const build = tests.find((t) => t.kind === "build");
  const compare = visual && Object.entries(visual.artifacts).find(([k]) => k.endsWith(":compare"))?.[1];

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-xs text-muted">Visual match</p>
          <p className="text-2xl font-semibold tabular-nums">{visual ? visual.score.toFixed(1) : "—"}</p>
        </div>
        {visual && (
          <Badge tone={visual.passed ? "good" : "warn"}>{visual.passed ? "meets target" : "below target"}</Badge>
        )}
        {security && (
          <Badge tone={security.passed ? "good" : "bad"}>security {security.passed ? "ok" : "blocked"}</Badge>
        )}
        {build && <Badge tone={build.passed ? "good" : "bad"}>build {build.passed ? "ok" : "failed"}</Badge>}
        <Button size="sm" variant="secondary" className="ml-auto" loading={rerunning} onClick={onRerun}>
          <RefreshCw /> Re-run QA
        </Button>
      </div>

      {!visual && <Empty title="No QA results for this version">QA runs after every generation and edit.</Empty>}

      {visual && (
        <div className="space-y-5 p-4">
          {compare && (
            <div>
              <div className="mb-2 flex gap-4 text-[11px] uppercase tracking-wider text-faint">
                <span className="flex-1">Reference (video)</span>
                <span className="flex-1">Generated</span>
                <span className="flex-1">Difference</span>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compare} alt="Reference, render and difference heatmap side by side" className="w-full" />
              </div>
            </div>
          )}

          {visual.metrics.sections && visual.metrics.sections.length > 0 && (
            <Card className="overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Section</th>
                    <th className="px-3 py-2 font-medium">Height (ref → out)</th>
                    <th className="px-3 py-2 font-medium">Background</th>
                    <th className="px-3 py-2 font-medium">Structure</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {visual.metrics.sections.map((s) => (
                    <tr key={`${s.page_id}-${s.id}`} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-fg">{s.id}</td>
                      <td className={cn("px-3 py-2 tabular-nums", Math.abs(1 - s.height_ratio) > 0.06 ? "text-warn" : "text-muted")}>
                        {s.ref_h} → {s.out_h ?? "missing"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-3 rounded-sm border border-line" style={{ background: s.ref_bg }} />
                          <span className="size-3 rounded-sm border border-line" style={{ background: s.out_bg }} />
                          <span className={cn("tabular-nums", s.color_delta > 8 ? "text-warn" : "text-muted")}>ΔE {s.color_delta}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted">{s.ssim.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <ScoreBadge score={s.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-3">
              <p className="mb-2 text-xs font-medium text-muted">Behaviour checks</p>
              {visual.metrics.behavior_checks?.length ? (
                <ul className="space-y-1.5 text-xs">
                  {visual.metrics.behavior_checks.map((b) => (
                    <li key={b.behavior} className="flex items-start gap-2">
                      {b.passed ? <CheckCircle2 className="size-4 text-good" /> : <XCircle className="size-4 text-bad" />}
                      <span>
                        <span className="font-mono">{b.effect}</span> <span className="text-muted">{b.message}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-faint">No click behaviours to verify.</p>
              )}
            </Card>
            <Card className="p-3">
              <p className="mb-2 text-xs font-medium text-muted">Responsive overflow</p>
              <ul className="space-y-1.5 text-xs">
                {Object.entries(visual.metrics.overflow ?? {}).map(([w, px]) => (
                  <li key={w} className="flex items-center gap-2">
                    {px > 2 ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-good" />}
                    <span className="tabular-nums">{w}px</span>
                    <span className="text-muted">{px > 2 ? `${px}px horizontal overflow` : "fits"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {visual.issues.length > 0 && (
            <div>
              <SectionTitle>Issues</SectionTitle>
              <ul className="space-y-1.5">
                {visual.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-xs">
                    <Badge tone={issue.severity === "high" ? "bad" : issue.severity === "medium" ? "warn" : "neutral"}>
                      {issue.kind}
                    </Badge>
                    <span className="text-muted">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {security && security.issues.length > 0 && (
            <div>
              <SectionTitle>Security findings</SectionTitle>
              <ul className="space-y-1.5">
                {security.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2 text-xs">
                    <Badge tone={issue.severity === "high" ? "bad" : "warn"}>{issue.severity}</Badge>
                    <span className="font-mono text-faint">{issue.file}</span>
                    <span className="text-muted">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- design inspector */

export function InspectorPanel({ spec }: { spec: DesignSpec | null }) {
  if (!spec) return <Empty title="No design spec yet">The AI Architect writes it during generation.</Empty>;
  const { tokens } = spec;
  return (
    <div className="h-full space-y-6 overflow-auto p-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <Badge>{spec.framework}</Badge>
        <Badge>
          {spec.viewport.width}×{spec.viewport.height}
        </Badge>
        <Badge>{spec.direction}</Badge>
        <Badge>{spec.language}</Badge>
      </div>

      <section>
        <SectionTitle>Colours</SectionTitle>
        <div className="grid grid-cols-2 gap-2 px-3 sm:grid-cols-4">
          {Object.entries(tokens.colors).map(([name, value]) => (
            <div key={name} className="overflow-hidden rounded-lg border border-line">
              <div className="h-12" style={{ background: value }} />
              <div className="px-2 py-1.5 text-xs">
                <p className="font-medium">{name}</p>
                <p className="font-mono text-faint">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Typography</SectionTitle>
        <div className="space-y-2 px-3">
          <p className="text-xs text-muted">
            Headings <span className="font-mono text-fg">{tokens.fonts.heading}</span> · Body{" "}
            <span className="font-mono text-fg">{tokens.fonts.body}</span>
          </p>
          {Object.entries(tokens.type_scale).map(([name, t]) => (
            <div key={name} className="flex items-baseline gap-3 border-b border-line/50 pb-2">
              <span className="w-12 font-mono text-xs text-faint">{name}</span>
              <span className="truncate" style={{ fontSize: Math.min(t.size, 40), fontWeight: t.weight, lineHeight: t.line_height }}>
                The quick brown fox
              </span>
              <span className="ml-auto shrink-0 font-mono text-xs text-faint">
                {t.size}px / {t.weight}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Spacing · radii</SectionTitle>
        <div className="flex flex-wrap items-end gap-4 px-3">
          {Object.entries(tokens.spacing).map(([name, v]) => (
            <div key={name} className="text-center text-[11px] text-faint">
              <div className="mx-auto bg-accent/40" style={{ width: v, height: v }} />
              {name} {v}
            </div>
          ))}
          {Object.entries(tokens.radii).map(([name, v]) => (
            <div key={name} className="text-center text-[11px] text-faint">
              <div className="mx-auto size-10 border border-accent/60 bg-accent/10" style={{ borderRadius: Math.min(v, 20) }} />
              r-{name}
            </div>
          ))}
        </div>
      </section>

      {spec.pages.map((page) => (
        <section key={page.id}>
          <SectionTitle>
            Page {page.route} · {page.sections.length} sections
          </SectionTitle>
          <div className="grid gap-3 px-3 lg:grid-cols-[180px_1fr]">
            {page.reference_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.reference_url} alt="Reference" className="hidden max-h-[560px] w-full rounded-md border border-line object-cover object-top lg:block" />
            )}
            <ul className="space-y-1.5">
              {page.sections.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
                  <span className="size-4 shrink-0 rounded border border-line" style={{ background: s.background_image ?? s.background ?? "transparent" }} />
                  <span className="font-mono text-fg">{s.id}</span>
                  <Badge>{s.component}</Badge>
                  {s.columns > 1 && <Badge tone="accent">{s.columns} cols</Badge>}
                  {s.sticky && <Badge tone="accent">sticky</Badge>}
                  <span className="ml-auto tabular-nums text-faint">{s.height_px ?? "auto"}px</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section>
        <SectionTitle>Behaviours from the recording</SectionTitle>
        {spec.behaviors.length === 0 ? (
          <p className="px-3 text-xs text-faint">No interactions were visible in the media.</p>
        ) : (
          <ul className="space-y-1.5 px-3">
            {spec.behaviors.map((b) => (
              <li key={b.id} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-fg">{b.effect}</span>
                  <Badge>{b.trigger}</Badge>
                  <span className="text-muted">→ {b.target || "page"}</span>
                  <span className="ml-auto text-faint">
                    {b.duration_ms}ms {b.easing} · {(b.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {b.evidence.t_start !== undefined && (
                  <p className="mt-1 text-faint">
                    Seen at {b.evidence.t_start.toFixed(2)}–{b.evidence.t_end?.toFixed(2)}s
                  </p>
                )}
                {b.evidence.source && <p className="mt-1 text-faint">{b.evidence.source}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {spec.assumptions.length > 0 && (
        <section>
          <SectionTitle>Assumptions</SectionTitle>
          <ul className="list-disc space-y-1 pl-8 pr-3 text-xs text-muted">
            {spec.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- export */

export function ExportPanel({ project, versionId }: { project: Project; versionId: string | null }) {
  const [busy, setBusy] = useState<"zip" | "github" | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string; href?: string } | null>(null);
  const [gh, setGh] = useState({ token: "", repo: project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), branch: "main", private: true });

  async function zip() {
    setBusy("zip");
    setMessage(null);
    try {
      const { blob, name } = await api.exportZip(project.id, versionId ?? undefined);
      downloadBlob(blob, name);
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setBusy(null);
    }
  }

  async function github() {
    setBusy("github");
    setMessage(null);
    try {
      const res = await api.exportGithub(project.id, { ...gh, create: true, message: "Export from Recode AI" });
      setMessage({ tone: "good", text: `Pushed version ${res.version}`, href: res.url });
      setGh((g) => ({ ...g, token: "" }));
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "GitHub export failed" });
    } finally {
      setBusy(null);
    }
  }

  if (!versionId) return <Empty title="Nothing to export yet" />;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Card className="flex items-center gap-4 p-4">
        <Package className="size-8 text-accent" />
        <div className="flex-1">
          <p className="font-medium">Download ZIP</p>
          <p className="text-sm text-muted">Source code plus a Dockerfile and nginx config, ready to deploy.</p>
        </div>
        <Button onClick={zip} loading={busy === "zip"}>
          Download
        </Button>
      </Card>
      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <GitBranch className="size-8" />
          <div>
            <p className="font-medium">Push to GitHub</p>
            <p className="text-sm text-muted">
              Creates the repository if needed and commits this version. The token is used once and never stored.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label hint="needs repo scope">Personal access token</Label>
            <Input type="password" autoComplete="off" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value })} />
          </div>
          <div>
            <Label hint="name or owner/name">Repository</Label>
            <Input value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value })} />
          </div>
          <div>
            <Label>Branch</Label>
            <Input value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={gh.private} onChange={(e) => setGh({ ...gh, private: e.target.checked })} />
            Private repository
          </label>
        </div>
        <Button onClick={github} loading={busy === "github"} disabled={!gh.token || !gh.repo}>
          <GitBranch /> Push
        </Button>
      </Card>
      {message && (
        <p className={cn("rounded-lg px-3 py-2 text-sm", message.tone === "good" ? "bg-good/10 text-good" : "bg-bad/10 text-bad")}>
          {message.text}{" "}
          {message.href && (
            <a href={message.href} target="_blank" rel="noreferrer" className="underline">
              Open repository
            </a>
          )}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- settings */

const ROLE_INFO: Record<Role, string> = {
  vision: "Reads keyframes and pages",
  reasoning: "AI Architect: writes the design spec",
  coding: "Frontend / animation / responsive / edits",
  qa: "Fixes visual differences",
};

export function SettingsPanel({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>(project.settings ?? {});
  const [framework, setFramework] = useState(project.framework);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const models = useMemo(() => meta?.providers.anthropic.models ?? [], [meta]);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => undefined);
  }, []);

  function setRole(role: Role, patch: Partial<NonNullable<ProjectSettings["models"]>[Role]>) {
    setSettings((s) => ({ ...s, models: { ...s.models, [role]: { ...s.models?.[role], ...patch } } }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      onSaved(await api.updateProject(project.id, { settings, framework }));
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card className="p-4">
        <p className="mb-1 font-medium">Models per role</p>
        <p className="mb-4 text-sm text-muted">
          Each engine uses its own model, so you can swap one without touching the others. Empty fields use the server
          defaults.
        </p>
        <div className="space-y-3">
          {(Object.keys(ROLE_INFO) as Role[]).map((role) => {
            const current = settings.models?.[role] ?? {};
            const fallback = meta?.roles[role];
            return (
              <div key={role} className="grid items-end gap-2 sm:grid-cols-[160px_1fr_1fr_120px]">
                <div>
                  <p className="text-sm font-medium capitalize">{role}</p>
                  <p className="text-xs text-faint">{ROLE_INFO[role]}</p>
                </div>
                <Select value={current.provider ?? ""} onChange={(e) => setRole(role, { provider: (e.target.value || null) as never })}>
                  <option value="">Provider: {fallback?.provider ?? "default"}</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="heuristic">Offline (computer vision)</option>
                </Select>
                <Select value={current.model ?? ""} onChange={(e) => setRole(role, { model: e.target.value || null })}>
                  <option value="">Model: {fallback?.model ?? "default"}</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Select value={current.effort ?? ""} onChange={(e) => setRole(role, { effort: (e.target.value || null) as Effort | null })}>
                  <option value="">Effort: {fallback?.effort ?? "default"}</option>
                  {(meta?.efforts ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
        {meta && !meta.providers.anthropic.available && (
          <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            No Anthropic credentials on the server: every role runs in offline mode (layout, colours and behaviours are
            measured; texts and fonts are placeholders).
          </p>
        )}
      </Card>

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <Label hint="0–100">QA target score</Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder={String(meta?.defaults.qa_threshold ?? 88)}
            value={settings.qa_threshold ?? ""}
            onChange={(e) => setSettings({ ...settings, qa_threshold: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <Label hint="auto-fix rounds">Max fix iterations</Label>
          <Input
            type="number"
            min={0}
            max={10}
            placeholder={String(meta?.defaults.max_fix_iterations ?? 3)}
            value={settings.max_fix_iterations ?? ""}
            onChange={(e) => setSettings({ ...settings, max_fix_iterations: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div>
          <Label hint="e.g. Vazirmatn">Font override</Label>
          <Input value={settings.font_override ?? ""} onChange={(e) => setSettings({ ...settings, font_override: e.target.value || null })} />
        </div>
        <div>
          <Label>Direction</Label>
          <Select value={settings.direction ?? ""} onChange={(e) => setSettings({ ...settings, direction: (e.target.value || null) as never })}>
            <option value="">Detect from content</option>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </Select>
        </div>
        <div>
          <Label hint="applies to the next generation">Output</Label>
          <Select value={framework} onChange={(e) => setFramework(e.target.value as Project["framework"])}>
            <option value="html">HTML + CSS + JS</option>
            <option value="react-vite">React (Vite){meta && !meta.sandbox.available ? " — needs Docker sandbox" : ""}</option>
          </Select>
        </div>
      </Card>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-good">Saved</span>}
        <Button onClick={save} loading={busy}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
