"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  confirm,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={confirm ? (event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      } : undefined}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
