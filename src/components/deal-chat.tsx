"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessageAction } from "@/app/actions/deals";
import type { FormState } from "@/app/actions/auth";
import { Card } from "./ui";
import { SubmitButton } from "./submit-button";

type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  isStaff: boolean;
  createdAt: string;
};

export function DealChat({
  dealId,
  currentUserId,
  messages,
}: {
  dealId: string;
  currentUserId: string;
  messages: ChatMessage[];
}) {
  const [state, action] = useActionState<FormState, FormData>(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Card title="Messages" description="Visible to the buyer, the seller and any moderator handling a dispute.">
      {messages.length === 0 ? (
        <p className="text-sm text-slate-500">No messages yet. Agree the details here before delivering.</p>
      ) : (
        <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {messages.map((message) => {
            const mine = message.senderId === currentUserId;
            return (
              <li key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    message.isStaff
                      ? "border border-amber-500/40 bg-amber-500/10 text-amber-100"
                      : mine
                        ? "bg-emerald-500/15 text-emerald-50"
                        : "bg-slate-800/70 text-slate-200"
                  }`}
                >
                  <p className="mb-1 text-[11px] text-slate-400">
                    {message.senderName}
                    {message.isStaff && " · moderator"} ·{" "}
                    {new Date(message.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} action={action} className="mt-4 flex gap-2">
        <input type="hidden" name="dealId" value={dealId} />
        <input
          name="body"
          className="input"
          placeholder="Write a message…"
          maxLength={4000}
          required
          aria-label="Message"
        />
        <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
      </form>
      {state.errors?.body && <p className="field-error">{state.errors.body}</p>}
      {state.errors?.form && <p className="field-error">{state.errors.form}</p>}
    </Card>
  );
}
