"use client";

import { ArrowUp, Bot, CheckCircle2, CircleDashed, Loader2, User, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Badge, Button, Progress, ScoreBadge, Textarea } from "@/components/ui";
import type { Message, Task } from "@/lib/types";
import { cn, isRtl } from "@/lib/utils";

const PIPELINE_STEPS = [
  { id: "ingest", label: "Video intelligence" },
  { id: "analyze", label: "UI analysis" },
  { id: "architect", label: "AI architect" },
  { id: "frontend", label: "Frontend agent" },
  { id: "animation", label: "Animation agent" },
  { id: "responsive", label: "Responsive agent" },
  { id: "qa", label: "Visual QA" },
  { id: "fix", label: "Auto-fix" },
  { id: "done", label: "Done" },
];
const ORDER = Object.fromEntries(PIPELINE_STEPS.map((s, i) => [s.id, i]));
ORDER.backend = ORDER.responsive;
ORDER.generate = ORDER.responsive;
ORDER.build = ORDER.qa;

export function PipelineCard({ task }: { task: Task }) {
  const [open, setOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const running = task.status === "running" || task.status === "queued";
  const current = ORDER[task.step] ?? -1;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [task.logs.length]);

  if (task.kind !== "pipeline") {
    const label = { video: "Analysing media", edit: "Applying your change", qa: "Running visual QA", capture: "Capturing URL" }[task.kind];
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
        {running ? <Loader2 className="size-3.5 animate-spin text-accent" /> : task.status === "failed" ? <XCircle className="size-3.5 text-bad" /> : <CheckCircle2 className="size-3.5 text-good" />}
        <span className="text-muted">{label}</span>
        {running && <Progress value={task.progress} className="ml-auto w-20" />}
        {task.error && <span className="truncate text-bad">{task.error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {running ? <Loader2 className="size-4 animate-spin text-accent" /> : task.status === "failed" ? <XCircle className="size-4 text-bad" /> : <CheckCircle2 className="size-4 text-good" />}
        <span className="text-sm font-medium">{running ? "Rebuilding from the recording" : task.status === "failed" ? "Generation failed" : "Generation finished"}</span>
        {typeof task.output.score === "number" && <ScoreBadge score={task.output.score as number} className="ml-auto" />}
      </button>
      {running && <Progress value={task.progress} className="mx-3 mb-2 w-auto" />}
      {open && (
        <div className="border-t border-line px-3 py-2">
          <ol className="mb-2 grid grid-cols-3 gap-x-2 gap-y-1">
            {PIPELINE_STEPS.map((s, i) => {
              const done = !running && task.status === "succeeded" ? true : i < current;
              const active = running && i === current;
              return (
                <li key={s.id} className={cn("flex items-center gap-1 text-[11px]", done ? "text-muted" : active ? "text-fg" : "text-faint")}>
                  {done ? <CheckCircle2 className="size-3 text-good" /> : active ? <Loader2 className="size-3 animate-spin text-accent" /> : <CircleDashed className="size-3" />}
                  {s.label}
                </li>
              );
            })}
          </ol>
          <div ref={logRef} className="max-h-40 space-y-0.5 overflow-auto rounded-md bg-bg/60 p-2 font-mono text-[11px] leading-relaxed">
            {task.logs.map((l, i) => (
              <p key={i} className="text-muted">
                <span className="text-accent-2">{l.step}</span> {l.message}
              </p>
            ))}
            {task.error && <p className="text-bad">{task.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "هدر را دقیقاً شبیه ویدئو کن",
  "Make the card entrance animation smoother",
  "فاصله سکشن دوم را ۳۰ پیکسل بیشتر کن",
  "فونت را به وزیرمتن تغییر بده",
  "Fix the mobile layout",
];

export function ChatPanel({
  messages,
  disabled,
  disabledReason,
  onSend,
}: {
  messages: Message[];
  disabled: boolean;
  disabledReason?: string;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text.trim());
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted">Ask for changes in plain language — Persian or English:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                dir="auto"
                disabled={disabled}
                onClick={() => setText(s)}
                className="block w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-muted hover:border-line-strong hover:text-fg disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5", m.role === "user" ? "bg-raised" : "bg-accent/20 text-accent")}>
              {m.role === "user" ? <User /> : <Bot />}
            </span>
            <div
              dir={isRtl(m.content) ? "rtl" : "ltr"}
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user" ? "bg-accent/15 text-fg" : "bg-panel-2 text-fg",
              )}
            >
              {m.content}
              {m.role === "assistant" && (m.meta.changed_files?.length || m.meta.score != null) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" dir="ltr">
                  {m.meta.changed_files?.slice(0, 4).map((f) => (
                    <Badge key={f} className="font-mono">
                      {f}
                    </Badge>
                  ))}
                  {m.meta.score != null && <ScoreBadge score={m.meta.score} />}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-line p-3">
        {error && <p className="mb-2 text-xs text-bad">{error}</p>}
        <div className="relative">
          <Textarea
            rows={3}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            disabled={disabled}
            placeholder={disabled ? disabledReason : "Describe a change… (Enter to send)"}
            className="resize-none pr-12"
          />
          <Button type="submit" size="icon" className="absolute bottom-2 right-2" disabled={disabled || !text.trim()} loading={sending} aria-label="Send">
            {!sending && <ArrowUp />}
          </Button>
        </div>
      </form>
    </div>
  );
}
