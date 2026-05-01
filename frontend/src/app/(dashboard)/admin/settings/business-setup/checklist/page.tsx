"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { clearSession } from "@/lib/auth/session";
import {
  executeBusinessReset,
  getResetPreview,
  getSetupChecklist,
  type BusinessResetExecuteRequest,
  type SetupChecklist,
} from "@/services/business-setup";

const RESET_CONFIRM_PHRASE = "RESET_SUBIDHA_CORE";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load checklist.";
}

export default function BusinessSetupChecklistPage() {
  const [data, setData] = useState<SetupChecklist | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState("subidhafurniture");
  const [confirm, setConfirm] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [resetResult, setResetResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getSetupChecklist(), getResetPreview("subidhafurniture")])
      .then(([checklist, resetPreview]) => {
        if (!isMounted) {
          return;
        }
        setData(checklist);
        setPreview(resetPreview);
        setResetResult(null);
        setError(null);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(toErrorMessage(loadError));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function refreshPreview(username: string) {
    try {
      const next = await getResetPreview(username);
      setPreview(next);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function runReset() {
    const isPhraseConfirmed = confirm.trim() === RESET_CONFIRM_PHRASE;
    if (!isPhraseConfirmed) {
      setError(`Type ${RESET_CONFIRM_PHRASE} exactly before running reset.`);
      return;
    }

    const payload: BusinessResetExecuteRequest = {
      confirm: true,
      preserve_username: resetUsername,
      delete_non_preserved_users: true,
      clear_auth_artifacts: true,
      dry_run: dryRun,
    };

    try {
      setRunning(true);
      setError(null);
      const response = await executeBusinessReset(payload);
      setResetResult(response);
      await refreshPreview(resetUsername);
      if (!dryRun) {
        clearSession();
        window.location.href = "/login";
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const required = (data?.items || []).filter((item) => item.level === "required");
  const recommended = (data?.items || []).filter((item) => item.level === "recommended");
  const optional = (data?.items || []).filter((item) => item.level === "optional");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business setup checklist"
        description="Review computed setup completion and go-live blockers."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Document Numbering</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Invoice, receipt, and direct-sale invoice numbering readiness.
                </div>
              </div>
              <Link href="/admin/settings/business-setup/document-numbering" className="text-sm font-medium text-primary hover:underline">
                Open setup
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                {
                  label: "Invoice numbering readiness",
                  ready: Boolean(data.counts?.invoice_numbering_configured),
                },
                {
                  label: "Receipt numbering readiness",
                  ready: Boolean(data.counts?.receipt_numbering_configured),
                },
                {
                  label: "Direct-sale invoice numbering readiness",
                  ready: Boolean(data.counts?.direct_sale_invoice_numbering_configured),
                },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs text-muted-foreground">{row.label}</div>
                  <div className={`mt-2 text-sm font-semibold ${row.ready ? "text-emerald-600" : "text-amber-600"}`}>
                    {row.ready ? "Ready" : "Needs setup"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Completion</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{data.percent_complete}%</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Checklist items</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{data.items.length}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {data.is_ready_for_go_live ? "Ready for go-live" : "Not ready yet"}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">
              Itemized checklist
            </div>
            <div className="divide-y divide-border">
              {[
                { label: "Required", items: required },
                { label: "Recommended", items: recommended },
                { label: "Optional", items: optional },
              ].map((group) => (
                <div key={group.label} className="px-5 py-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="mt-3 divide-y divide-border rounded-xl border border-border">
                    {group.items.map((item) => (
                      <div key={item.key} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.label}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                              item.status === "complete"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : item.status === "warning"
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-rose-500/10 text-rose-600"
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.route ? (
                            <Link href={item.route} className="text-sm font-medium text-primary hover:underline">
                              Open
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {group.items.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No items.</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-sm font-medium text-muted-foreground">Go-live reset (controlled)</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Deletes business data using the backend reset service while preserving only the chosen admin username. Run dry-run first.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Preserve username
                <input
                  value={resetUsername}
                  onChange={(event) => {
                    const next = event.target.value;
                    setResetUsername(next);
                    void refreshPreview(next);
                  }}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="subidhafurniture"
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Confirm string
                <input
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder={RESET_CONFIRM_PHRASE}
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
                Dry run (recommended)
              </label>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void runReset()}
                  disabled={running}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {running ? "Running..." : dryRun ? "Run dry-run reset" : "Execute reset"}
                </button>
              </div>
            </div>

            {resetResult ? (
              <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">
                {JSON.stringify(resetResult, null, 2)}
              </pre>
            ) : null}
          </section>

          {preview ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Reset preview</div>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">{JSON.stringify(preview, null, 2)}</pre>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
