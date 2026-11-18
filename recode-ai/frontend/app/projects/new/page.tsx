"use client";

import { Film, Globe, Image as ImageIcon, MessageSquareText, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, Input, Label, Progress, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import type { Framework, SourceType } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

const SOURCES: { value: SourceType; label: string; icon: React.ReactNode; hint: string; accept?: string }[] = [
  { value: "video", label: "Video", icon: <Film />, hint: "MP4, MOV or WebM screen recording", accept: "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v,.mkv" },
  { value: "screenshot", label: "Screenshot", icon: <ImageIcon />, hint: "PNG, JPEG or WebP — full-page works best", accept: "image/png,image/jpeg,image/webp" },
  { value: "url", label: "URL", icon: <Globe />, hint: "A public page is captured full-length in a browser" },
  { value: "prompt", label: "Description", icon: <MessageSquareText />, hint: "No media — describe the site in words" },
];

export default function NewProjectPage() {
  return (
    <AppShell>
      <NewProject />
    </AppShell>
  );
}

function NewProject() {
  const router = useRouter();
  const [source, setSource] = useState<SourceType>("video");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [framework, setFramework] = useState<Framework>("html");
  const [files, setFiles] = useState<File[]>([]);
  const [upload, setUpload] = useState<{ index: number; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = SOURCES.find((s) => s.value === source)!;
  const needsFiles = source === "video" || source === "screenshot";

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    setFiles((f) => [...f, ...picked]);
    if (!name && picked[0]) setName(picked[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsFiles && files.length === 0) {
      setError("Add at least one file.");
      return;
    }
    setBusy(true);
    try {
      const project = await api.createProject({
        name: name.trim() || "Untitled project",
        description,
        source_type: source,
        source_url: source === "url" ? url : null,
        framework,
      });
      for (let i = 0; i < files.length; i++) {
        setUpload({ index: i, progress: 0 });
        await api.uploadAsset(project.id, files[i], (p) => setUpload({ index: i, progress: p }));
      }
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
      setBusy(false);
      setUpload(null);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted">Give Recode AI a real example. It analyses it and rebuilds it as code.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SOURCES.map((s) => (
          <button
            type="button"
            key={s.value}
            onClick={() => {
              setSource(s.value);
              setFiles([]);
            }}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors [&_svg]:size-5",
              source === s.value ? "border-accent/60 bg-accent/10 text-fg" : "border-line bg-panel text-muted hover:border-line-strong",
            )}
          >
            {s.icon}
            <span className="text-sm font-medium text-fg">{s.label}</span>
          </button>
        ))}
      </div>

      <Card className="space-y-5 p-5">
        {needsFiles && (
          <div>
            <Label hint={current.hint}>{source === "video" ? "Recordings" : "Screenshots"}</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors",
                dragging ? "border-accent bg-accent/5" : "border-line-strong hover:border-accent/50",
              )}
            >
              <UploadCloud className="size-8 text-faint" />
              <p className="text-sm">
                Drop files here or <span className="text-accent">browse</span>
              </p>
              <p className="text-xs text-faint">
                {source === "video"
                  ? "Scroll slowly, open menus, hover cards. Several recordings become several pages."
                  : "One screenshot per page."}
              </p>
              <input ref={input} type="file" multiple accept={current.accept} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-faint">{formatBytes(f.size)}</span>
                    {upload && upload.index === i ? (
                      <Progress value={upload.progress} className="w-24" />
                    ) : (
                      !busy && (
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                          <X className="size-4 text-faint hover:text-fg" />
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {source === "url" && (
          <div>
            <Label hint={current.hint}>Page URL</Label>
            <Input type="url" required placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div>
            <Label>Project name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Landing page" />
          </div>
          <div>
            <Label>Output</Label>
            <Select value={framework} onChange={(e) => setFramework(e.target.value as Framework)}>
              <option value="html">HTML + CSS + JS</option>
              <option value="react-vite">React (Vite)</option>
            </Select>
          </div>
        </div>

        <div>
          <Label hint={source === "prompt" ? "required" : "optional"}>
            {source === "prompt" ? "Describe the site" : "Notes for the AI"}
          </Label>
          <Textarea
            rows={4}
            required={source === "prompt"}
            dir="auto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              source === "prompt"
                ? "A landing page for a Persian coffee shop with a menu, gallery and opening hours…"
                : "Anything the recording doesn't show: brand name, what the buttons should do…"
            }
          />
        </div>
      </Card>

      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-faint">
          Use material you have the right to reproduce. Recode AI rebuilds visible design and behaviour, not private code or
          assets.
        </p>
        <Button type="submit" size="lg" loading={busy}>
          {busy ? (upload ? "Uploading…" : "Creating…") : "Create project"}
        </Button>
      </div>
    </form>
  );
}
