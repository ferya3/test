"use client";

import { ArrowLeft, Code2, KeyRound, Download, Eye, Files, Film, History, Microscope, Play, RotateCw, ScanSearch, Settings2, Sparkles, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, ScoreBadge, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Asset, FileEntry, Frame, Message, Project, ProjectEvent, SpecRecord, Task, TestResult, Usage, Version } from "@/lib/types";
import { useProjectEvents } from "@/lib/use-project-events";
import { cn } from "@/lib/utils";
import { ChatPanel, PipelineCard } from "./ai-panel";
import { AssetsSummary, FileExplorer, FramesPanel, VersionsPanel } from "./panels-left";
import { CodeEditor, ExportPanel, InspectorPanel, LivePreview, QAPanel, SettingsPanel } from "./panels-center";

type LeftTab = "files" | "frames" | "versions";
type CenterTab = "preview" | "code" | "qa" | "inspector" | "export" | "settings";
type MobilePane = "left" | "center" | "right";

const BUSY = new Set(["processing", "analyzing", "generating", "testing"]);

export function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [spec, setSpec] = useState<SpecRecord | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  const [pinnedVersion, setPinnedVersion] = useState<string | null>(null);
  const [left, setLeft] = useState<LeftTab>("frames");
  const [center, setCenter] = useState<CenterTab>("preview");
  const [mobile, setMobile] = useState<MobilePane>("center");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [qaRunning, setQaRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api
      .meta()
      .then((m) => setOffline(Object.values(m.roles).every((r) => r.offline)))
      .catch(() => undefined);
  }, []);

  const versionId = pinnedVersion ?? project?.current_version_id ?? null;

  /* ------------------------------------------------------------ loading */

  const loadProject = useCallback(
    () =>
      api
        .project(projectId)
        .then(setProject)
        .catch((e) => e instanceof ApiError && e.status === 404 && setNotFound(true)),
    [projectId],
  );
  const loadMedia = useCallback(() => {
    api.assets(projectId).then(setAssets).catch(() => undefined);
    api.frames(projectId).then(setFrames).catch(() => undefined);
  }, [projectId]);
  const loadTasks = useCallback(() => api.tasks(projectId).then(setTasks).catch(() => undefined), [projectId]);
  const loadVersions = useCallback(() => api.versions(projectId).then(setVersions).catch(() => undefined), [projectId]);
  const loadSpec = useCallback(() => api.spec(projectId).then(setSpec).catch(() => setSpec(null)), [projectId]);
  const loadMessages = useCallback(() => api.messages(projectId).then(setMessages).catch(() => undefined), [projectId]);
  const loadUsage = useCallback(() => api.usage(projectId).then(setUsage).catch(() => undefined), [projectId]);

  useEffect(() => {
    void loadProject();
    loadMedia();
    void loadTasks();
    void loadVersions();
    void loadSpec();
    void loadMessages();
    void loadUsage();
  }, [loadProject, loadMedia, loadTasks, loadVersions, loadSpec, loadMessages, loadUsage]);

  useEffect(() => {
    if (!versionId) return;
    let alive = true;
    api.files(projectId, versionId).then((f) => {
      if (!alive) return;
      setFiles(f);
      setContents({});
    });
    api.tests(projectId, versionId).then((t) => alive && setTests(t));
    return () => {
      alive = false;
    };
  }, [projectId, versionId]);

  useEffect(() => {
    if (!openPath || !versionId || openPath in contents) return;
    let alive = true;
    api
      .file(projectId, openPath, versionId)
      .then((f) => alive && setContents((c) => ({ ...c, [openPath]: f.content ?? "" })))
      .catch(() => alive && setContents((c) => ({ ...c, [openPath]: "" })));
    return () => {
      alive = false;
    };
  }, [projectId, openPath, versionId, contents]);

  /* ----------------------------------------------------------- realtime */

  const onEvent = useCallback(
    (event: ProjectEvent) => {
      switch (event.type) {
        case "progress":
          setTasks((ts) =>
            ts.map((t) =>
              t.id === event.task_id
                ? {
                    ...t,
                    status: "running",
                    progress: Math.max(t.progress, Number(event.progress) || 0),
                    step: (event.step as string) || t.step,
                    logs: event.message
                      ? [...t.logs, { t: new Date().toISOString(), step: (event.step as string) || t.step, message: String(event.message) }]
                      : t.logs,
                  }
                : t,
            ),
          );
          break;
        case "task":
          void loadTasks();
          if (event.status === "succeeded" || event.status === "failed") {
            void loadProject();
            void loadSpec();
            void loadVersions();
            void loadUsage();
            loadMedia();
          }
          break;
        case "asset":
          loadMedia();
          break;
        case "version":
          void loadVersions();
          void loadProject();
          break;
        case "qa":
          void loadVersions();
          if (event.version_id === versionId) api.tests(projectId, versionId!).then(setTests);
          break;
        case "message":
          void loadMessages();
          break;
        case "project":
          void loadProject();
          break;
        case "usage":
          void loadUsage();
          break;
      }
    },
    [loadTasks, loadProject, loadSpec, loadVersions, loadUsage, loadMedia, loadMessages, projectId, versionId],
  );
  const live = useProjectEvents(projectId, onEvent);

  // safety net when the socket is down: poll while something runs
  const activeTask = useMemo(() => tasks.find((t) => t.status === "running" || t.status === "queued") ?? null, [tasks]);
  useEffect(() => {
    if (live || !activeTask) return;
    const timer = setInterval(() => {
      void loadTasks();
      void loadProject();
      void loadVersions();
    }, 3000);
    return () => clearInterval(timer);
  }, [live, activeTask, loadTasks, loadProject, loadVersions]);

  /* ------------------------------------------------------------- actions */

  async function generate() {
    setStarting(true);
    setActionError(null);
    try {
      const task = await api.generate(projectId, { reuse_analysis: true });
      setTasks((ts) => [task, ...ts]);
      setPinnedVersion(null);
      void loadProject();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setStarting(false);
    }
  }

  async function rerunQa() {
    if (!versionId) return;
    setQaRunning(true);
    try {
      const task = await api.rerunQa(projectId, versionId);
      setTasks((ts) => [task, ...ts]);
    } finally {
      setQaRunning(false);
    }
  }

  async function saveDrafts() {
    setSaving(true);
    setActionError(null);
    try {
      const names = Object.keys(drafts);
      await api.saveFiles(projectId, drafts, `Edited ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`);
      setDrafts({});
      setPinnedVersion(null);
      await Promise.all([loadVersions(), loadProject(), loadTasks()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function restore(id: string) {
    await api.restore(projectId, id);
    setPinnedVersion(null);
    await Promise.all([loadVersions(), loadProject()]);
  }

  async function sendMessage(text: string) {
    const message = await api.sendMessage(projectId, text);
    setMessages((m) => [...m, message]);
    void loadTasks();
  }

  /* --------------------------------------------------------------- render */

  if (notFound) return <Empty title="Project not found"><Link className="text-accent" href="/">Back to projects</Link></Empty>;
  if (!project)
    return (
      <div className="grid h-screen place-items-center">
        <Spinner />
      </div>
    );

  const busy = BUSY.has(project.status) || !!activeTask;
  const currentVersion = versions.find((v) => v.id === versionId);
  const hasMedia = assets.length > 0 || project.source_type === "prompt";
  const recentTasks = tasks.slice(0, 4);
  const dirty = new Set(Object.keys(drafts));

  const leftPane = (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <Tabs
        className="border-b border-line px-2 py-1.5"
        value={left}
        onChange={setLeft}
        items={[
          { value: "frames", label: "Frames", icon: <Film /> },
          { value: "files", label: "Files", icon: <Files /> },
          { value: "versions", label: "Versions", icon: <History /> },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {left === "files" && (
          <FileExplorer
            files={files}
            active={openPath}
            dirty={dirty}
            onOpen={(p) => {
              setOpenPath(p);
              setCenter("code");
              setMobile("center");
            }}
          />
        )}
        {left === "frames" && (
          <>
            <AssetsSummary assets={assets} />
            <FramesPanel frames={frames} assets={assets} />
          </>
        )}
        {left === "versions" && (
          <VersionsPanel versions={versions} currentId={project.current_version_id} selectedId={versionId} onSelect={setPinnedVersion} onRestore={restore} />
        )}
      </div>
    </aside>
  );

  const centerPane = (
    <section className="flex min-h-0 min-w-0 flex-col bg-bg">
      <Tabs
        className="border-b border-line px-2 py-1.5"
        value={center}
        onChange={setCenter}
        items={[
          { value: "preview", label: "Preview", icon: <Eye /> },
          { value: "code", label: "Code", icon: <Code2 />, badge: dirty.size ? <span className="size-1.5 rounded-full bg-warn" /> : undefined },
          { value: "qa", label: "Visual QA", icon: <ScanSearch />, badge: tests.find((t) => t.kind === "visual") ? <ScoreBadge score={tests.find((t) => t.kind === "visual")!.score} /> : undefined },
          { value: "inspector", label: "Inspector", icon: <Microscope /> },
          { value: "export", label: "Export", icon: <Download /> },
          { value: "settings", label: "Settings", icon: <Settings2 /> },
        ]}
      />
      <div className="min-h-0 flex-1">
        {center === "preview" && <LivePreview projectId={projectId} versionId={versionId} />}
        {center === "code" && (
          <CodeEditor
            path={openPath}
            value={openPath ? (drafts[openPath] ?? contents[openPath] ?? null) : null}
            dirty={dirty.size}
            saving={saving}
            onChange={(v) => openPath && setDrafts((d) => ({ ...d, [openPath]: v }))}
            onSave={saveDrafts}
          />
        )}
        {center === "qa" && <QAPanel tests={tests} onRerun={rerunQa} rerunning={qaRunning} />}
        {center === "inspector" && <InspectorPanel spec={spec?.spec ?? null} />}
        {center === "export" && <ExportPanel project={project} versionId={versionId} />}
        {center === "settings" && <SettingsPanel project={project} onSaved={setProject} />}
      </div>
    </section>
  );

  const rightPane = (
    <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Sparkles className="size-4 text-accent" />
        <span className="text-sm font-medium">AI Workspace</span>
        {usage && usage.calls > 0 && (
          <span className="ml-auto text-[11px] tabular-nums text-faint" title={`${usage.input_tokens} in / ${usage.output_tokens} out tokens`}>
            {usage.calls} calls · ${usage.cost_usd.toFixed(2)}
          </span>
        )}
      </div>
      {recentTasks.length > 0 && (
        <div className="max-h-[45%] space-y-2 overflow-auto border-b border-line p-3">
          {recentTasks.map((t) => (
            <PipelineCard key={t.id} task={t} />
          ))}
        </div>
      )}
      <ChatPanel
        messages={messages}
        disabled={!project.current_version_id || busy}
        disabledReason={!project.current_version_id ? "Generate the project first" : "Wait for the current task"}
        onSend={sendMessage}
      />
    </aside>
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <Link href="/" className="text-muted hover:text-fg" aria-label="Back to projects">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="truncate text-sm font-semibold">{project.name}</h1>
        <StatusBadge status={project.status} />
        {currentVersion && (
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
            v{currentVersion.number}
            {pinnedVersion && pinnedVersion !== project.current_version_id && (
              <button className="text-accent hover:underline" onClick={() => setPinnedVersion(null)}>
                (viewing old version — back to current)
              </button>
            )}
            <ScoreBadge score={currentVersion.score} />
          </span>
        )}
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-faint md:inline-flex" title={live ? "Live updates connected" : "Live updates offline (polling)"}>
          {live ? <Wifi className="size-3.5 text-good" /> : <WifiOff className="size-3.5" />}
        </span>
        {actionError && <span className="hidden max-w-xs truncate text-xs text-bad lg:inline">{actionError}</span>}
        <Button size="sm" onClick={generate} loading={starting} disabled={busy || !hasMedia} title={!hasMedia ? "Upload media first" : undefined} className="max-md:ml-auto">
          {project.current_version_id ? <RotateCw /> : <Play />}
          {project.current_version_id ? "Regenerate" : "Generate"}
        </Button>
      </header>

      {offline && (
        <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-sm">
          <KeyRound className="size-4 text-warn" />
          <span className="text-fg">
            Offline mode: layout, pictures and text are measured from your media, but no AI model is used.
          </span>
          <Link href="/settings" className="ml-auto shrink-0 font-medium text-warn underline-offset-4 hover:underline">
            Add your API key
          </Link>
          <button onClick={() => setOffline(false)} aria-label="Dismiss" className="text-muted hover:text-fg">
            ×
          </button>
        </div>
      )}

      {!project.current_version_id && !activeTask && hasMedia && project.status !== "failed" && (
        <div className="flex items-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-sm">
          <Sparkles className="size-4 text-accent" />
          <span className="text-fg">Media is analysed. Start the pipeline to rebuild it as code.</span>
          <Button size="sm" className="ml-auto" onClick={generate} loading={starting}>
            <Play /> Generate
          </Button>
        </div>
      )}

      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        {leftPane}
        {centerPane}
        {rightPane}
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="grid min-h-0 flex-1">{mobile === "left" ? leftPane : mobile === "right" ? rightPane : centerPane}</div>
        <nav className="grid grid-cols-3 border-t border-line bg-panel">
          {(["left", "center", "right"] as MobilePane[]).map((p) => (
            <button key={p} onClick={() => setMobile(p)} className={cn("py-2.5 text-xs", mobile === p ? "text-fg" : "text-muted")}>
              {p === "left" ? "Project" : p === "center" ? "Preview & code" : "AI"}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
