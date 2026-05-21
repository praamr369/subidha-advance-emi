"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ActionButton from "@/components/ui/ActionButton";
import { normalizeApiError } from "@/services/api";
import { createReconciliationRun, getReconciliationModules } from "@/services/reconciliation/control-tower";
import type { ReconciliationModuleSummary, ReconciliationRun } from "@/types/reconciliation";

import ReconciliationModuleMatrix from "./ReconciliationModuleMatrix";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReconciliationOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [modules, setModules] = useState<ReconciliationModuleSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getReconciliationModules();
      setRun(payload.run);
      setModules(payload.results || []);
    } catch (e) {
      setError(normalizeApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultDateFrom = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() - 30);
    return now.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(todayISO());
  const [running, setRunning] = useState(false);

  return (
    <ERPSectionShell
      title="Reconciliation Control Tower (Phase F)"
      description="Deterministic, low-noise exception checks only. No auto-correction."
    >
      <ERPDataToolbar
        left={
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-xs font-semibold text-muted-foreground">From</div>
              <input
                className="mt-1 h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={running}
              />
            </label>
            <label className="block">
              <div className="text-xs font-semibold text-muted-foreground">To</div>
              <input
                className="mt-1 h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={running}
              />
            </label>
          </div>
        }
        right={
          <>
            <ActionButton
              variant="outline"
              onClick={() => void load()}
              disabled={running}
            >
              Refresh
            </ActionButton>
            <ActionButton
              variant="primary"
              loading={running}
              onClick={async () => {
                if (running) return;
                setRunning(true);
                setError(null);
                try {
                  await createReconciliationRun({
                    scope: "PHASE_F",
                    module: "CONTROL_TOWER",
                    date_from: dateFrom,
                    date_to: dateTo,
                    branch_id: run?.branch ?? null,
                  });
                  await load();
                } catch (e) {
                  setError(normalizeApiError(e).message);
                } finally {
                  setRunning(false);
                }
              }}
            >
              Run Phase F Checks
            </ActionButton>
          </>
        }
      />

      {loading ? <ERPLoadingState /> : null}
      {error ? <ERPErrorState title="Failed to load reconciliation overview" description={error} /> : null}
      {!loading && !error ? <ReconciliationModuleMatrix run={run} modules={modules} /> : null}
    </ERPSectionShell>
  );
}

