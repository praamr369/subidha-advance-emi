"use client";

import { useEffect, useState } from "react";

import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import type { WorkspacePayload } from "@/services/admin-erp";

export function WorkspaceCardsPage({
  title,
  subtitle,
  loader,
  boardTitle,
}: {
  title: string;
  subtitle: string;
  boardTitle: string;
  loader: () => Promise<WorkspacePayload>;
}) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loader()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load workspace.");
      });
    return () => {
      active = false;
    };
  }, [loader]);

  return (
    <WorkspaceShell title={title} subtitle={subtitle}>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {payload ? <PipelineBoard title={boardTitle} cards={payload.cards} /> : <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">Loading workspace...</div>}
    </WorkspaceShell>
  );
}
