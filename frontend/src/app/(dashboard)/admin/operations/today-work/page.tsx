"use client";

import { useEffect, useState } from "react";

import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import { getAdminTodayWork, type ErpCard } from "@/services/admin-erp";

export default function AdminTodayWorkPage() {
  const [cards, setCards] = useState<ErpCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getAdminTodayWork()
      .then((payload) => {
        if (!active) return;
        setCards(payload.results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load today's work.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <WorkspaceShell
      title="Today's Work"
      subtitle="Daily admin action queues from the existing ERP summary service."
    >
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">Loading today&apos;s work...</div>
      ) : (
        <PipelineBoard title="Action Queues" cards={cards} />
      )}
    </WorkspaceShell>
  );
}
