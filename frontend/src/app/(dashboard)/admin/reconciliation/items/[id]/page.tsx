"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import { normalizeApiError } from "@/services/api";
import { getReconciliationItem, reopenReconciliationItem, resolveReconciliationItem } from "@/services/reconciliation/control-tower";
import type { ReconciliationItemDetail } from "@/types/reconciliation";

import ReconciliationEvidencePanel from "@/components/admin/reconciliation/ReconciliationEvidencePanel";
import ReconciliationImpactSummary from "@/components/admin/reconciliation/ReconciliationImpactSummary";
import ReconciliationResolutionDrawer from "@/components/admin/reconciliation/ReconciliationResolutionDrawer";
import ReconciliationSeverityBadge from "@/components/admin/reconciliation/ReconciliationSeverityBadge";

export default function AdminReconciliationItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<ReconciliationItemDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"resolve" | "reopen">("resolve");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getReconciliationItem(id);
      setItem(payload);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(() => {
    if (!item) return "Reconciliation Item";
    return item.exception_code || `Item #${item.id}`;
  }, [item]);

  return (
    <ERPPageShell
      eyebrow="Finance · Reconciliation"
      title={title}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reconciliation", href: ROUTES.admin.reconciliation },
        { label: title },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Exception Detail"
          description="Phase F reconciliation items are read-only against source financial records."
        >
          {loading ? <ERPLoadingState /> : null}
          {error ? <ERPErrorState title="Failed to load item" description={error} /> : null}

          {!loading && !error && item ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ReconciliationSeverityBadge severity={item.severity} />
                  <span className="text-sm font-semibold">{item.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.source_type}#{item.source_id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ActionButton
                    variant="outline"
                    onClick={() => {
                      setDrawerMode("reopen");
                      setDrawerOpen(true);
                    }}
                  >
                    Reopen
                  </ActionButton>
                  <ActionButton
                    variant="primary"
                    onClick={() => {
                      setDrawerMode("resolve");
                      setDrawerOpen(true);
                    }}
                  >
                    Resolve
                  </ActionButton>
                </div>
              </div>

              <ERPDetailGrid
                items={[
                  { label: "Run", value: item.run_no ? String(item.run_no) : String(item.run) },
                  { label: "Module", value: item.module },
                  { label: "Exception Code", value: item.exception_code },
                  { label: "Created", value: item.created_at },
                  { label: "Updated", value: item.updated_at },
                ]}
              />

              {item.exception_message ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground">Message</div>
                  <div className="mt-2 text-sm">{item.exception_message}</div>
                </div>
              ) : null}

              {item.recommended_action ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold text-muted-foreground">Recommended Action</div>
                  <div className="mt-2 text-sm">{item.recommended_action}</div>
                </div>
              ) : null}

              <ReconciliationImpactSummary item={item} />

              <ReconciliationEvidencePanel
                evidence={item.evidence || []}
                resolutions={item.resolutions || []}
              />

              <ReconciliationResolutionDrawer
                open={drawerOpen}
                mode={drawerMode}
                title={drawerMode === "resolve" ? "Resolve Exception" : "Reopen Exception"}
                onClose={() => setDrawerOpen(false)}
                onSubmit={async (payload) => {
                  if (!item) return;
                  if (drawerMode === "resolve") {
                    await resolveReconciliationItem(item.id, { action: payload.action || "MARK_REVIEWED", note: payload.note });
                  } else {
                    await reopenReconciliationItem(item.id, { note: payload.note });
                  }
                  await load();
                }}
              />
            </div>
          ) : null}
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
