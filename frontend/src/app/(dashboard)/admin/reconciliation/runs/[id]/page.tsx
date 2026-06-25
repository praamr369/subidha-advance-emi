"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ActionButton from "@/components/ui/ActionButton";
import { buildAdminReconciliationReportPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { normalizeApiError } from "@/services/api";
import { getReconciliationModules, getReconciliationRun, listReconciliationItems } from "@/services/reconciliation/control-tower";
import type { ReconciliationItem, ReconciliationModuleSummary, ReconciliationRun } from "@/types/reconciliation";

import ReconciliationExceptionQueue from "@/components/admin/reconciliation/ReconciliationExceptionQueue";
import ReconciliationModuleMatrix from "@/components/admin/reconciliation/ReconciliationModuleMatrix";

export default function AdminReconciliationRunDetailPage() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id ?? "";
  const searchParams = useSearchParams();
  const moduleFilter = useMemo(() => (searchParams.get("module") || "").trim(), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [modules, setModules] = useState<ReconciliationModuleSummary[]>([]);
  const [items, setItems] = useState<ReconciliationItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [runPayload, modulePayload, itemsPayload] = await Promise.all([
        getReconciliationRun(id),
        getReconciliationModules(id),
        listReconciliationItems({
          run: id,
          module: moduleFilter || undefined,
        }),
      ]);
      setRun(runPayload);
      setModules(modulePayload.results || []);
      setItems(itemsPayload.results || []);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [id, moduleFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      eyebrow="Finance · Reconciliation"
      title={run ? `Reconciliation Run #${run.run_no}` : "Reconciliation Run"}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reconciliation", href: ROUTES.admin.reconciliation },
        { label: run ? `Run #${run.run_no}` : "Run Detail" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Run Summary"
          description={run ? `Status: ${run.status} • Scope: ${run.scope} • Module: ${run.module}` : "Run details"}
        >
          <ERPDataToolbar
            left={
              run ? (
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Checked</div>
                    <div className="mt-1 font-semibold">{run.total_checked}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Matched</div>
                    <div className="mt-1 font-semibold">{run.total_matched}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Exceptions</div>
                    <div className="mt-1 font-semibold">{run.total_exceptions}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">High Risk</div>
                    <div className="mt-1 font-semibold">{run.high_risk_count}</div>
                  </div>
                </div>
              ) : null
            }
            right={
              <div className="flex flex-wrap gap-2">
                {run ? (
                  <Link
                    href={buildAdminReconciliationReportPrintRoute(run.id)}
                    className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/30"
                  >
                    Reconciliation Report PDF / Print
                  </Link>
                ) : null}
                <ActionButton variant="outline" onClick={() => void load()}>
                  Refresh
                </ActionButton>
              </div>
            }
          />

          {loading ? <ERPLoadingState /> : null}
          {error ? <ERPErrorState title="Failed to load run" description={error} /> : null}
        </ERPSectionShell>

        <ERPSectionShell title="Module Matrix" description="Open exceptions per module for this run.">
          {loading ? <ERPLoadingState /> : null}
          {!loading && !error ? <ReconciliationModuleMatrix run={run} modules={modules} /> : null}
        </ERPSectionShell>

        <ERPSectionShell
          title={moduleFilter ? `Exception Queue — ${moduleFilter}` : "Exception Queue"}
          description="Deterministic Phase F items only. Resolve adds notes/status; it does not change source records."
        >
          {loading ? <ERPLoadingState /> : null}
          {!loading && !error ? <ReconciliationExceptionQueue items={items} /> : null}
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
