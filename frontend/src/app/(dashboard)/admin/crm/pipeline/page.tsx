"use client";

import { useCallback, useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import KanbanBoard, { type KanbanLead } from "@/components/crm/KanbanBoard";
import LeadDetailModal from "@/components/crm/LeadDetailModal";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

export default function CRMPipelinePage() {
  const [leads, setLeads] = useState<KanbanLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/v1/crm-pipeline/pipeline/');
      setLeads(data.results || data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const handleStageChange = async (leadId: number, newStage: string) => {
    try {
      await apiFetch(`/api/v1/crm-pipeline/pipeline/${leadId}/stage/`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      });
      setLeads(leads.map(l =>
        l.id === leadId ? { ...l, current_stage: newStage } : l
      ));
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const handleApproveSuccess = () => {
    loadPipeline();
    setSelectedLead(null);
  };

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Pipeline - Leads to Sales"
      subtitle="Drag leads between stages to manage the sales funnel. Click to approve and auto-create contracts."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crmWorkspace },
        { label: "Pipeline" },
      ]}
      actions={[
        { href: ROUTES.admin.crmWorkspace, label: "Workspace", variant: "secondary" },
        { href: ROUTES.admin.crmAnalytics, label: "CRM Analytics", variant: "secondary" },
        { href: ROUTES.admin.crmPipelineAnalytics, label: "Pipeline Analytics", variant: "primary" },
      ]}
      statusBadge={{ label: "Unified Pipeline", tone: "success" as const }}
      stats={[
        {
          label: "Total Leads",
          value: leads.length,
          tone: "default" as const,
        },
        {
          label: "Approved",
          value: leads.filter(l => l.current_stage === 'APPROVED').length,
          tone: "success" as const,
        },
        {
          label: "Converted",
          value: leads.filter(l => l.current_stage === 'CONVERTED').length,
          tone: "default" as const,
        },
      ]}
    >
      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading ? (
        <ERPLoadingState label="Loading pipeline..." />
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No leads in pipeline yet</p>
        </div>
      ) : (
        <ERPSectionShell
          title="Kanban Board"
          description="Drag leads between columns to update status. Click to approve and auto-create contracts."
        >
          <KanbanBoard
            leads={leads}
            onStageChange={handleStageChange}
            onLeadClick={setSelectedLead}
          />
        </ERPSectionShell>
      )}

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onApprove={handleApproveSuccess}
        />
      )}
    </ERPPageShell>
  );
}
