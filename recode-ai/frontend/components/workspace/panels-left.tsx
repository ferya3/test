"use client";

import { ChevronDown, ChevronRight, FileCode2, FileJson, FileText, Folder, History, MousePointerClick, MoveVertical, RotateCcw, Scissors } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Empty, ScoreBadge, SectionTitle } from "@/components/ui";
import type { Asset, FileEntry, Frame, TimelineEvent, Version } from "@/lib/types";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

/* ------------------------------------------------------------ file tree */

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: FileEntry;
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!node.children.has(part)) node.children.set(part, { name: part, path, children: new Map() });
      node = node.children.get(part)!;
      if (i === parts.length - 1) node.file = file;
    });
  }
  return root;
}

function fileIcon(path: string) {
  if (path.endsWith(".json")) return <FileJson />;
  if (/\.(md|txt)$/.test(path)) return <FileText />;
  return <FileCode2 />;
}

export function FileExplorer({
  files,
  active,
  dirty,
  onOpen,
}: {
  files: FileEntry[];
  active: string | null;
  dirty: Set<string>;
  onOpen: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const render = (node: TreeNode, depth: number) =>
    [...node.children.values()]
      .sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))
      .map((child) => {
        const isDir = !child.file;
        const open = !closed.has(child.path);
        return (
          <div key={child.path}>
            <button
              onClick={() =>
                isDir
                  ? setClosed((s) => {
                      const next = new Set(s);
                      if (next.has(child.path)) next.delete(child.path);
                      else next.add(child.path);
                      return next;
                    })
                  : onOpen(child.path)
              }
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] [&_svg]:size-3.5 [&_svg]:shrink-0",
                active === child.path ? "bg-accent/15 text-fg" : "text-muted hover:bg-raised hover:text-fg",
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
              title={child.path}
            >
              {isDir ? (open ? <ChevronDown /> : <ChevronRight />) : <span className="w-3.5" />}
              {isDir ? <Folder className="text-accent-2" /> : fileIcon(child.path)}
              <span className="truncate">{child.name}</span>
              {child.file && dirty.has(child.path) && <span className="ml-auto size-1.5 rounded-full bg-warn" />}
            </button>
            {isDir && open && render(child, depth + 1)}
          </div>
        );
      });

  if (files.length === 0) return <Empty icon={<FileCode2 />} title="No files yet">Generate the project to see its code.</Empty>;
  return (
    <div className="px-1.5 pb-3">
      <SectionTitle>
        Files <span className="ml-1 font-normal normal-case text-faint">{files.length}</span>
      </SectionTitle>
      {render(tree, 0)}
    </div>
  );
}

/* --------------------------------------------------------------- frames */

const EVENT_ICON = { scroll: <MoveVertical />, interaction: <MousePointerClick />, cut: <Scissors /> };

export function FramesPanel({ frames, assets }: { frames: Frame[]; assets: Asset[] }) {
  const [zoom, setZoom] = useState<Frame | null>(null);
  const events: TimelineEvent[] = assets.flatMap((a) => a.meta.events ?? []);
  const video = assets.find((a) => a.kind === "video");
  const duration = video?.meta.probe?.duration ?? Math.max(1, ...events.map((e) => e.t_end));
  const keyframes = frames.filter((f) => f.kind === "keyframe");
  const pages = frames.filter((f) => f.kind === "stitched");

  if (frames.length === 0)
    return <Empty title="No frames yet">Frames appear here after the recording has been analysed.</Empty>;

  return (
    <div className="space-y-1 pb-4">
      {video?.meta.probe && (
        <div className="px-3 pt-3 text-xs text-muted">
          {video.meta.probe.width}×{video.meta.probe.height} · {video.meta.probe.fps.toFixed(0)} fps ·{" "}
          {video.meta.probe.duration.toFixed(1)}s
        </div>
      )}
      {events.length > 0 && (
        <>
          <SectionTitle>Timeline</SectionTitle>
          <div className="px-3">
            <div className="relative h-6 rounded-md bg-panel-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  title={`${e.kind} ${e.t_start.toFixed(1)}–${e.t_end.toFixed(1)}s ${e.hint || e.direction || ""}`}
                  className={cn(
                    "absolute top-1 h-4 rounded-sm",
                    e.kind === "scroll" ? "bg-accent-2/50" : e.kind === "interaction" ? "bg-accent" : "bg-warn",
                  )}
                  style={{
                    left: `${(e.t_start / duration) * 100}%`,
                    width: `${Math.max(1.5, ((e.t_end - e.t_start) / duration) * 100)}%`,
                  }}
                />
              ))}
            </div>
            <ul className="mt-2 space-y-1">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-xs text-muted [&_svg]:size-3.5">
                  {EVENT_ICON[e.kind]}
                  <span className="tabular-nums text-faint">{e.t_start.toFixed(1)}s</span>
                  <span className="truncate text-fg">
                    {e.kind === "scroll"
                      ? `Scroll ${e.direction} ${Math.round(e.distance_px)}px`
                      : e.kind === "cut"
                        ? "Scene change"
                        : e.hint.replace(/-/g, " ")}
                  </span>
                  <span className="ml-auto tabular-nums text-faint">{Math.round((e.t_end - e.t_start) * 1000)}ms</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {pages.length > 0 && (
        <>
          <SectionTitle>Stitched pages</SectionTitle>
          <div className="grid grid-cols-2 gap-2 px-3">
            {pages.map((f) => (
              <button key={f.id} onClick={() => setZoom(f)} className="overflow-hidden rounded-md border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url ?? ""} alt={`Page ${f.frame_index + 1}`} className="h-28 w-full object-cover object-top" />
                <span className="block px-1.5 py-1 text-left text-[11px] text-muted">
                  {f.width}×{f.height}
                  {f.meta.sticky_header_px ? " · sticky header" : ""}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <SectionTitle>Keyframes</SectionTitle>
      <div className="grid grid-cols-2 gap-2 px-3">
        {keyframes.map((f) => (
          <button key={f.id} onClick={() => setZoom(f)} className="group overflow-hidden rounded-md border border-line text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url ?? ""} alt={`Frame at ${f.timestamp}s`} className="aspect-video w-full object-cover" />
            <span className="block truncate px-1.5 py-1 text-[11px] text-muted">
              <span className="tabular-nums text-fg">{f.timestamp.toFixed(1)}s</span> {f.meta.reasons?.join(", ")}
            </span>
          </button>
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={() => setZoom(null)} role="dialog">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url ?? ""} alt="" className="max-h-full max-w-full overflow-auto rounded-lg border border-line" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- versions */

const AUTHOR: Record<Version["author"], string> = { ai: "AI", user: "You", "qa-fix": "QA fix", restore: "Restore" };

export function VersionsPanel({
  versions,
  currentId,
  selectedId,
  onSelect,
  onRestore,
}: {
  versions: Version[];
  currentId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  if (versions.length === 0) return <Empty icon={<History />} title="No versions yet" />;
  return (
    <div className="space-y-1 px-1.5 pb-4">
      <SectionTitle>History</SectionTitle>
      {versions.map((v) => (
        <div
          key={v.id}
          className={cn(
            "group rounded-lg border px-2.5 py-2",
            v.id === selectedId ? "border-accent/50 bg-accent/10" : "border-transparent hover:bg-raised",
          )}
        >
          <button onClick={() => onSelect(v.id)} className="w-full text-left">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium tabular-nums">v{v.number}</span>
              <Badge tone={v.author === "user" ? "accent" : "neutral"}>{AUTHOR[v.author]}</Badge>
              {v.id === currentId && <Badge tone="good">current</Badge>}
              <ScoreBadge score={v.score} className="ml-auto" />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted" dir="auto">
              {v.message}
            </p>
            <p className="mt-1 text-[11px] text-faint">{timeAgo(v.created_at)}</p>
          </button>
          {v.id !== currentId && (
            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => onRestore(v.id)}>
              <RotateCcw /> Restore
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AssetsSummary({ assets }: { assets: Asset[] }) {
  if (!assets.length) return null;
  return (
    <ul className="space-y-1 px-3 pb-2 text-xs text-muted">
      {assets.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <span className="truncate">{a.filename}</span>
          <span className="text-faint">{formatBytes(a.size)}</span>
          <Badge tone={a.status === "analyzed" ? "good" : a.status === "failed" ? "bad" : "accent"} className="ml-auto">
            {a.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
