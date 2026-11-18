"use client";

import { Film, Globe, Image as ImageIcon, MessageSquareText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, Empty, ScoreBadge, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const SOURCE_ICON = {
  video: <Film />,
  screenshot: <ImageIcon />,
  url: <Globe />,
  prompt: <MessageSquareText />,
};

export default function Dashboard() {
  return (
    <AppShell>
      <Projects />
    </AppShell>
  );
}

function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .projects()
        .then((p) => alive && setProjects(p))
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 5000); // statuses change while jobs run
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function remove(project: Project) {
    if (!confirm(`Delete “${project.name}” with all its versions and media? This cannot be undone.`)) return;
    await api.deleteProject(project.id);
    setProjects((ps) => ps?.filter((p) => p.id !== project.id) ?? null);
  }

  const busy = projects?.filter((p) => ["processing", "analyzing", "generating", "testing"].includes(p.status)).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted">
            {projects ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "Loading"}
            {busy > 0 && ` · ${busy} running`}
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus /> New project
          </Button>
        </Link>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {!projects && !error && (
        <div className="grid h-60 place-items-center">
          <Spinner />
        </div>
      )}
      {projects?.length === 0 && (
        <Card>
          <Empty icon={<Film />} title="Start with a recording">
            Upload a screen recording of a website — scroll through it, open the menus, hover the cards. Recode AI turns
            what it sees into a working project.
            <div className="mt-4">
              <Link href="/projects/new">
                <Button>
                  <Plus /> New project
                </Button>
              </Link>
            </div>
          </Empty>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="group overflow-hidden transition-colors hover:border-line-strong">
              <Link href={`/projects/${p.id}`} className="block">
                <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-panel-2">
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
                  ) : (
                    <div className="grid h-full place-items-center text-faint [&_svg]:size-8">{SOURCE_ICON[p.source_type]}</div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    <StatusBadge status={p.status} />
                  </div>
                  <ScoreBadge score={p.score} className="absolute right-2 top-2" />
                </div>
              </Link>
              <div className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="block truncate font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 [&_svg]:size-3">
                      {SOURCE_ICON[p.source_type]} {p.source_type}
                    </span>
                    <span>·</span>
                    <Badge>{p.framework}</Badge>
                    <span>·</span>
                    <span>{timeAgo(p.updated_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => remove(p)}
                  className="text-faint opacity-0 transition hover:text-bad group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
