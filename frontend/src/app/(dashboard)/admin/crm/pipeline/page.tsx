"use client";

import { useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { getInternalCrmLeads } from "@/services/crm-module";

type LeadRow = {
  id: number;
  name: string;
  phone: string;
  stage: string;
  interested_plan_type: string;
  next_follow_up_at: string | null;
  assigned_to: number | null;
};

const STAGES = ["NEW", "CONTACTED", "INTERESTED", "KYC_PENDING", "READY_TO_CONVERT", "CONVERTED", "LOST"];

export default function AdminCrmPipelinePage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = await getInternalCrmLeads();
        if (!active) return;
        const typed = payload as { results?: LeadRow[] };
        const next = Array.isArray(typed?.results) ? typed.results : [];
        setRows(next as LeadRow[]);
        setError(null);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : "Unable to load CRM pipeline.";
        setError(message);
        setRows([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    return STAGES.map((stage) => ({
      stage,
      leads: rows.filter((row) => row.stage === stage),
    }));
  }, [rows]);

  return (
    <ERPPageShell
      title="CRM Pipeline"
      subtitle="Internal lead stage board for Lucky Plan, rent/lease, and direct-sale conversion readiness."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "CRM", href: "/admin/crm" }, { label: "Pipeline" }]}
    >
      <ERPSectionShell
        title="Stage board"
        description="Stage visibility only; lead conversion and financial mutations remain in their dedicated modules."
      >
        {loading ? <ERPLoadingState label="Loading pipeline..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load CRM pipeline" description={error} /> : null}
        {!loading && !error ? (
          rows.length === 0 ? (
            <ERPEmptyState title="No leads in pipeline" description="No pipeline rows are available right now." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-4">
              {grouped.map((col) => (
                <section
                  key={col.stage}
                  className="rounded-[1.35rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{col.stage}</h3>
                    <span className="rounded-full border border-border bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {col.leads.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {col.leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-muted)_44%,transparent)] p-3 text-sm"
                      >
                        <div className="font-medium text-foreground">{lead.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{lead.phone}</div>
                        <div className="mt-2 text-xs font-medium text-foreground/90">
                          {lead.interested_plan_type || "—"}
                        </div>
                      </div>
                    ))}
                    {col.leads.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-border/80 bg-[color-mix(in_oklab,var(--surface-muted)_50%,transparent)] px-3 py-2 text-xs text-muted-foreground">
                        No leads
                      </p>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
