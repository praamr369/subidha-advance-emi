"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getInternalCrmLeads,
  moveLeadStage,
  type InternalLeadRow,
  type LeadStage,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
} from "@/services/crm-module";

const STAGE_COLORS: Record<LeadStage, string> = {
  NEW: "bg-blue-50 border-blue-200 text-blue-800",
  CONTACTED: "bg-purple-50 border-purple-200 text-purple-800",
  INTERESTED: "bg-yellow-50 border-yellow-200 text-yellow-800",
  KYC_PENDING: "bg-orange-50 border-orange-200 text-orange-800",
  READY_TO_CONVERT: "bg-teal-50 border-teal-200 text-teal-800",
  CONVERTED: "bg-green-50 border-green-200 text-green-800",
  LOST: "bg-gray-50 border-gray-200 text-muted-foreground",
};

const NEXT_STAGES: Record<LeadStage, LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["INTERESTED", "LOST"],
  INTERESTED: ["KYC_PENDING", "LOST"],
  KYC_PENDING: ["READY_TO_CONVERT", "LOST"],
  READY_TO_CONVERT: ["CONVERTED", "LOST"],
  CONVERTED: [],
  LOST: ["NEW"],
};

function LeadCard({
  lead,
  onStageMove,
}: {
  lead: InternalLeadRow;
  onStageMove: (lead: InternalLeadRow, stage: LeadStage) => Promise<void>;
}) {
  const [moving, setMoving] = useState(false);
  const nextStages = NEXT_STAGES[lead.stage] ?? [];

  async function handleMove(stage: LeadStage) {
    setMoving(true);
    try {
      await onStageMove(lead, stage);
    } finally {
      setMoving(false);
    }
  }

  const isOverdue =
    lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= new Date();

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`${ROUTES.admin.crmLeads}/${lead.id}`}
          className="font-semibold text-foreground hover:text-primary hover:underline underline-offset-4 leading-tight"
        >
          {lead.name}
        </Link>
        {lead.source ? (
          <span className="flex-shrink-0 rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
            {lead.source.replace("_", " ")}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{lead.phone}</div>
      {lead.product_name ? (
        <div className="mt-1 text-xs text-foreground/70">{lead.product_name}</div>
      ) : null}
      {lead.interested_plan_type ? (
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {lead.interested_plan_type.replace("_", " ")}
        </div>
      ) : null}
      {lead.assigned_to_username ? (
        <div className="mt-1 text-[10px] text-muted-foreground">
          → {lead.assigned_to_full_name || lead.assigned_to_username}
        </div>
      ) : null}
      {isOverdue ? (
        <div className="mt-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
          Follow-up overdue
        </div>
      ) : null}
      {nextStages.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {nextStages.map((stage) => (
            <button
              key={stage}
              disabled={moving}
              onClick={() => void handleMove(stage)}
              className="rounded-lg border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {moving ? "…" : `→ ${LEAD_STAGE_LABELS[stage]}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminCrmPipelinePage() {
  const [rows, setRows] = useState<InternalLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<LeadStage | "">("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInternalCrmLeads({ q: search || undefined, stage: filterStage || undefined });
      setRows(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load pipeline.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStage]);

  useEffect(() => { void load(); }, [load]);

  const handleStageMove = useCallback(async (lead: InternalLeadRow, stage: LeadStage) => {
    await moveLeadStage(lead.id, stage);
    setRows((prev) =>
      prev.map((r) => (r.id === lead.id ? { ...r, stage } : r))
    );
  }, []);

  const grouped = useMemo(() => {
    const visibleStages = filterStage ? [filterStage] : LEAD_STAGES;
    return visibleStages.map((stage) => ({
      stage,
      leads: rows.filter((r) => r.stage === stage),
    }));
  }, [rows, filterStage]);

  const totalActive = rows.filter((r) => r.stage !== "CONVERTED" && r.stage !== "LOST").length;

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="CRM Pipeline"
      subtitle="Lead stage board. Use the stage buttons on each card to advance leads through the pipeline."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Pipeline" },
      ]}
      stats={[
        { label: "Total Leads", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(totalActive), tone: "default" },
        { label: "Converted", value: String(rows.filter((r) => r.stage === "CONVERTED").length), tone: "success" },
        { label: "Lost", value: String(rows.filter((r) => r.stage === "LOST").length), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Pipeline board"
        description="Each card shows the lead's current stage. Use the arrow buttons to move stages. Click a lead name to open the full detail view."
      >
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search name / phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm w-52"
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value as LeadStage | "")}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Refresh
          </button>
          <Link
            href={ROUTES.admin.crmLeads}
            className="ml-auto flex h-9 items-center rounded-xl border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + Add Lead
          </Link>
        </div>

        {loading ? <ERPLoadingState label="Loading pipeline…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load pipeline" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No leads in pipeline" description="Create the first lead to start tracking your sales pipeline." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-max">
              {grouped.map((col) => (
                <div
                  key={col.stage}
                  className="w-52 flex-shrink-0 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STAGE_COLORS[col.stage as LeadStage] || "bg-gray-50 border-gray-200 text-muted-foreground"}`}>
                      {LEAD_STAGE_LABELS[col.stage as LeadStage] || col.stage}
                    </span>
                    <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {col.leads.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {col.leads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onStageMove={handleStageMove} />
                    ))}
                    {col.leads.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border/60 bg-muted/40 px-3 py-3 text-xs text-muted-foreground text-center">
                        No leads
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
