"use client";

import { useEffect, useState } from "react";

import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
      {error ? <ERPErrorState title="Unable to load today's work" description={error} /> : null}
      {loading ? (
        <ERPLoadingState label="Loading today's work..." />
      ) : (
        <ERPSectionShell title="Action Queues" description="Prioritized admin action queues from the existing ERP service.">
          <PipelineBoard title="Action Queues" cards={cards} />
        </ERPSectionShell>
      )}
    </WorkspaceShell>
  );
}
