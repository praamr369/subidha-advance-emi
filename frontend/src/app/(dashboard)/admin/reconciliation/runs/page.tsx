"use client";

import { useCallback, useEffect, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { normalizeApiError } from "@/services/api";
import { listReconciliationRuns } from "@/services/reconciliation/control-tower";
import type { ReconciliationRun } from "@/types/reconciliation";

import ReconciliationOverview from "@/components/admin/reconciliation/ReconciliationOverview";
import ReconciliationRunTable from "@/components/admin/reconciliation/ReconciliationRunTable";

export default function AdminReconciliationRunsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await listReconciliationRuns();
      setRuns(payload.results || []);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell title="Reconciliation Runs">
      <div className="space-y-6">
        <ReconciliationOverview />

        <ERPSectionShell title="Run History" description="Phase F runs are synchronous and read-only against source records.">
          {loading ? <ERPLoadingState /> : null}
          {error ? <ERPErrorState title="Failed to load runs" description={error} /> : null}
          {!loading && !error ? <ReconciliationRunTable runs={runs} /> : null}
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}

