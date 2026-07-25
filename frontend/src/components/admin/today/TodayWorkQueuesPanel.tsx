"use client";

import { useEffect, useState } from "react";

import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { getAdminTodayWork, type ErpCard } from "@/services/admin-erp";

/**
 * Prioritized admin action queues rendered as a pipeline board from the ERP
 * summary service. Extracted from /admin/operations/today-work so the same
 * workflow renders both on that route and as a tab in the unified Today command
 * center (/admin/today).
 */
export default function TodayWorkQueuesPanel() {
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

  if (error) return <ERPErrorState title="Unable to load today's work" description={error} />;
  if (loading) return <ERPLoadingState label="Loading today's work..." />;

  return (
    <ERPSectionShell title="Action Queues" description="Prioritized admin action queues from the existing ERP service.">
      <PipelineBoard title="Action Queues" cards={cards} />
    </ERPSectionShell>
  );
}
