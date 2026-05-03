"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ErrorState from "@/components/feedback/ErrorState";
import ActionButton from "@/components/ui/ActionButton";
import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import {
  getDryRunHistory,
  getDryRunOptions,
  postDryRunRun,
  type DryRunCheckOption,
  type DryRunHistoryRun,
  type DryRunResultRow,
  type DryRunRunResponse,
} from "@/services/business-setup/dry-runs";

const SECTIONS: { id: string; title: string; description: string; keys: string[] }[] = [
  {
    id: "quick",
    title: "Quick checks",
    description: "Fast validation of setup signals and API path heuristics.",
    keys: ["SETUP_READINESS", "API_CONTRACT"],
  },
  {
    id: "setup",
    title: "Setup & accounting",
    description: "Business readiness and finance account mapping consistency.",
    keys: ["ACCOUNTING_SETUP"],
  },
  {
    id: "data",
    title: "Data management",
    description: "Reset and import/export posture (read-only guidance; no uploads here).",
    keys: ["SELECTIVE_RESET_PREVIEW", "EXPORT_PREVIEW", "IMPORT_PREVIEW"],
  },
  {
    id: "frontend",
    title: "Frontend workflow direction",
    description: "Route registry vs real Next.js admin pages.",
    keys: ["FRONTEND_ROUTE_WORKFLOW"],
  },
  {
    id: "finance",
    title: "Finance safety",
    description: "Payment and reconciliation coverage signals (counts only).",
    keys: ["PAYMENT_FINANCE_SAFETY"],
  },
  {
    id: "operations",
    title: "Operations readiness",
    description: "Lucky Plan, inventory, and internal access posture.",
    keys: ["LUCKY_PLAN_WORKFLOW", "INVENTORY_SALES_PURCHASE_READINESS", "HR_READINESS"],
  },
];

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PASS":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "WARNING":
      return "border-amber-300 bg-amber-50 text-amber-950";
    case "BLOCKED":
      return "border-destructive bg-destructive/15 text-destructive ring-2 ring-destructive/30";
    case "FAILED":
      return "border-destructive bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export default function DryRunControlCenterPage() {
  const [checks, setChecks] = useState<DryRunCheckOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["SETUP_READINESS", "API_CONTRACT"]));
  const [scopesText, setScopesText] = useState("");
  const [includeFinancial, setIncludeFinancial] = useState(true);
  const [includePersonal, setIncludePersonal] = useState(false);
  const [includeHighRisk, setIncludeHighRisk] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<DryRunRunResponse | null>(null);
  const [history, setHistory] = useState<DryRunHistoryRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const allKeys = useMemo(() => checks.map((c) => c.key), [checks]);

  const loadOptions = useCallback(async () => {
    try {
      setLoadingOptions(true);
      setOptionsError(null);
      const res = await getDryRunOptions();
      setChecks(res.checks);
    } catch (err) {
      setOptionsError(toErrorMessage(err));
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryError(null);
      const res = await getDryRunHistory(15);
      setHistory(res.runs);
    } catch (err) {
      setHistoryError(toErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadOptions();
    void loadHistory();
  }, [loadOptions, loadHistory]);

  function toggleKey(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function parseScopes(): string[] {
    return scopesText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function runWithKeys(keys: string[]) {
    if (!keys.length) {
      setRunError("Select at least one dry run check.");
      return;
    }
    try {
      setRunning(true);
      setRunError(null);
      const scopes = parseScopes();
      const res = await postDryRunRun({
        checks: keys,
        scopes,
        options: {
          include_financial_checks: includeFinancial,
          include_personal_data_checks: includePersonal,
          include_high_risk: includeHighRisk,
        },
      });
      setLastRun(res);
      await loadHistory();
    } catch (err) {
      setRunError(toErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const sortedResults: DryRunResultRow[] = useMemo(() => {
    if (!lastRun?.results) {
      return [];
    }
    const order = { BLOCKED: 0, FAILED: 1, WARNING: 2, PASS: 3 };
    return [...lastRun.results].sort(
      (a, b) => (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9)
    );
  }, [lastRun]);

  return (
    <div className="space-y-8" data-testid="dry-run-control-center">
      <PageHeader
        title="Dry Run Control Center"
        description="Read-only validation hub for setup, routing, API contracts, and finance safety before live operations."
      />

      <div
        className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950 shadow-sm"
        role="note"
      >
        <div className="font-semibold">Safety</div>
        <p className="mt-1 leading-relaxed">
          Dry runs do not mutate business data. They validate readiness, workflow direction, dependencies, and
          financial safety. Results may be stored as validation metadata (job summary only), never as import/export
          payloads.
        </p>
      </div>

      <BusinessSetupLinks />

      {optionsError ? <ErrorState description={optionsError} onRetry={() => void loadOptions()} /> : null}
      {runError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {runError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="dry-run-options">
        <h2 id="dry-run-options" className="text-base font-semibold text-foreground">
          Run options
        </h2>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={includeFinancial} onChange={(e) => setIncludeFinancial(e.target.checked)} />
            Include financial checks
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={includePersonal} onChange={(e) => setIncludePersonal(e.target.checked)} />
            Include personal-data awareness (export/import guidance)
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={includeHighRisk} onChange={(e) => setIncludeHighRisk(e.target.checked)} />
            Include high-risk scopes (descriptive only)
          </label>
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="scopes-field">
            Optional reset / export app scopes (comma-separated app labels)
          </label>
          <input
            id="scopes-field"
            className="mt-1 w-full max-w-xl rounded-xl border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g. subscriptions, accounting"
            value={scopesText}
            onChange={(e) => setScopesText(e.target.value)}
          />
        </div>
      </section>

      {loadingOptions && !checks.length ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground" aria-busy="true">
          Loading dry run catalog…
        </section>
      ) : null}

      {!loadingOptions && !checks.length ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No checks returned from the server.
        </section>
      ) : null}

      {SECTIONS.map((section) => {
        const sectionChecks = checks.filter((c) => section.keys.includes(c.key));
        if (!sectionChecks.length) {
          return null;
        }
        return (
          <section key={section.id} className="space-y-3" aria-labelledby={`section-${section.id}`}>
            <div>
              <h2 id={`section-${section.id}`} className="text-lg font-semibold text-foreground">
                {section.title}
              </h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sectionChecks.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-ring"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(c.key)}
                      onChange={() => toggleKey(c.key)}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{c.label}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {c.risk_level}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Validates:{" "}
                        {c.supports_scopes ? "scopes supported — use optional scopes field. " : ""}
                        {c.requires_upload ? "file upload uses separate import preview screens. " : ""}
                        {!c.supports_scopes && !c.requires_upload ? "read-only queries and static analysis." : ""}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Run dry runs">
        <h2 className="text-base font-semibold text-foreground">Execute</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These actions only call validation endpoints. There is no execute / reset / import / export on this page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            data-testid="dry-run-run-selected"
            onClick={() => void runWithKeys(Array.from(selected))}
            disabled={running || selected.size === 0}
          >
            {running ? "Running…" : "Run selected dry runs"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void runWithKeys(allKeys)}
            disabled={running || !allKeys.length}
          >
            Run full pre-live dry run
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void runWithKeys(["FRONTEND_ROUTE_WORKFLOW", "API_CONTRACT"])}
            disabled={running}
          >
            Run frontend workflow dry run
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void runWithKeys(["PAYMENT_FINANCE_SAFETY", "ACCOUNTING_SETUP"])}
            disabled={running}
          >
            Run finance safety dry run
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => void runWithKeys(["SELECTIVE_RESET_PREVIEW", "EXPORT_PREVIEW", "IMPORT_PREVIEW"])}
            disabled={running}
          >
            Run data-management dry run
          </ActionButton>
        </div>
      </section>

      {lastRun ? (
        <section className="space-y-4" aria-live="polite">
          <h2 className="text-lg font-semibold text-foreground">Latest results</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["pass", "warning", "blocked", "failed"] as const).map((key) => (
              <div key={key} className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground" data-testid={`dry-run-summary-${key}`}>
                  {lastRun.summary[key]}
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Check</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Module</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Problem</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Recommended action</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Safe after dry run</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {sortedResults.map((row, idx) => (
                  <tr
                    key={`${row.check}-${idx}-${row.title}`}
                    data-testid={row.status === "BLOCKED" ? "dry-run-row-blocked" : "dry-run-row"}
                  >
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{row.check}</td>
                    <td className="px-3 py-2 align-top">{row.module}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-foreground">{row.title}</div>
                      <div className="mt-1 text-muted-foreground">{row.detail}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{row.recommended_action}</td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          row.safe_to_execute ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-border bg-muted"
                        }`}
                      >
                        {row.safe_to_execute ? "Allowed" : "Not allowed"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.action_href.startsWith("/") ? (
                        <Link href={row.action_href} className="font-medium text-primary hover:underline">
                          Open
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Run id: {lastRun.run_id}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          No run yet. Select checks and press &quot;Run selected dry runs&quot;, or use a preset above.
        </section>
      )}

      <section className="space-y-3" aria-labelledby="dry-run-history">
        <h2 id="dry-run-history" className="text-lg font-semibold text-foreground">
          History
        </h2>
        {historyError ? <p className="text-sm text-destructive">{historyError}</p> : null}
        {!history.length && !historyError ? (
          <p className="text-sm text-muted-foreground">No validation jobs recorded yet.</p>
        ) : null}
        <ul className="space-y-2">
          {history.map((run) => (
            <li key={run.run_id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{run.run_id}</span>
                <span className="text-xs text-muted-foreground">{run.created_at}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                PASS {run.summary?.pass ?? 0} · WARN {run.summary?.warning ?? 0} · BLOCKED {run.summary?.blocked ?? 0}{" "}
                · FAILED {run.summary?.failed ?? 0}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Checks: {run.checks.join(", ")}</div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Related:{" "}
        <Link href={ROUTES.admin.settingsBusinessSetupChecklist} className="text-primary underline">
          Business setup checklist
        </Link>
        {" · "}
        <Link href={ROUTES.admin.settingsImports} className="text-primary underline">
          Imports & export hub
        </Link>
      </p>
    </div>
  );
}
