"use client";

import { useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
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

  useEffect(() => {
    void getInternalCrmLeads().then((payload) => {
      const typed = payload as { results?: LeadRow[] };
      const next = Array.isArray(typed?.results) ? typed.results : [];
      setRows(next as LeadRow[]);
    });
  }, []);

  const grouped = useMemo(() => {
    return STAGES.map((stage) => ({
      stage,
      leads: rows.filter((row) => row.stage === stage),
    }));
  }, [rows]);

  return (
    <PortalPage
      title="CRM Pipeline"
      subtitle="Internal lead stage board for Lucky Plan, rent/lease, and direct-sale conversion readiness."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "CRM", href: "/admin/crm" }, { label: "Pipeline" }]}
    >
      <div className="grid gap-4 xl:grid-cols-4">
        {grouped.map((col) => (
          <section key={col.stage} className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{col.stage}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{col.leads.length} lead(s)</p>
            <div className="space-y-2">
              {col.leads.map((lead) => (
                <div key={lead.id} className="rounded-lg border border-border p-2 text-sm">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-muted-foreground">{lead.phone}</div>
                  <div className="text-xs">{lead.interested_plan_type}</div>
                </div>
              ))}
              {col.leads.length === 0 ? <p className="text-xs text-muted-foreground">No leads</p> : null}
            </div>
          </section>
        ))}
      </div>
    </PortalPage>
  );
}

