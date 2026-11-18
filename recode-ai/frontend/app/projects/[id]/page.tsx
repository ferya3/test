"use client";

import { useParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { Workspace } from "@/components/workspace/workspace";
import { useAuth } from "@/lib/auth";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  if (loading || !user)
    return (
      <div className="grid h-screen place-items-center">
        <Spinner />
      </div>
    );
  return <Workspace projectId={id} />;
}
