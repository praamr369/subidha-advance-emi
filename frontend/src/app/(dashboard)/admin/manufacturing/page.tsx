"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import StatCard from "@/components/ui/StatCard";
import { buildAdminManufacturingJobRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getManufacturingOverview, type ManufacturingOverview } from "@/services/manufacturing";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the manufacturing overview.";
}

export default function AdminManufacturingOverviewPage() {
  const [payload, setPayload] = useState<ManufacturingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      setLoading(true);
      const next = await getManufacturingOverview();
      setPayload(next);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  return (
    <ERPPageShell
      title="Manufacturing"
      subtitle="Run BOM governance, raw-material issue, WIP tracking, finished-goods receipt, and scrap capture through explicit production jobs that link back to inventory and accounting without becoming a second stock or finance truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing" },
      ]}
      actions={[
        { href: ROUTES.admin.manufacturingBoms, label: "BOM Register", variant: "secondary" },
        { href: ROUTES.admin.manufacturingJobs, label: "Production Jobs", variant: "primary" },
      ]}
      stats={[
        { label: "BOMs", value: String(payload?.summary.bom_count ?? 0), tone: "info" },
        { label: "Jobs", value: String(payload?.summary.job_count ?? 0), tone: "info" },
        {
          label: "In Progress",
          value: String(payload?.summary.in_progress_count ?? 0),
          tone: (payload?.summary.in_progress_count ?? 0) > 0 ? "warning" : "success",
        },
        {
          label: "Deferred",
          value: String(payload?.summary.deferred_count ?? 0),
          tone: (payload?.summary.deferred_count ?? 0) > 0 ? "warning" : "default",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading manufacturing overview..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load manufacturing"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && payload ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Active BOMs"
                value={String(payload.summary.active_bom_count)}
                subtext="Approved BOM revisions ready for production release."
                tone={payload.summary.active_bom_count > 0 ? "success" : "warning"}
              />
              <StatCard
                label="Released Jobs"
                value={String(payload.summary.released_count)}
                subtext="Jobs waiting for explicit material issue posting."
                tone={payload.summary.released_count > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Completed Jobs"
                value={String(payload.summary.completed_count)}
                subtext="Jobs that have cleared WIP and posted finished output."
                tone="success"
              />
              <StatCard
                label="Deferred Costing"
                value={String(payload.summary.deferred_count)}
                subtext="Jobs whose accounting bridge stayed deferred because costing support was incomplete."
                tone={payload.summary.deferred_count > 0 ? "warning" : "default"}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <ERPSectionShell
                title="Recent Production Jobs"
                description="Raw issue, WIP, finished-goods receipt, and scrap all remain traceable at the job level."
                actions={
                  <Link className="text-sm font-medium text-primary underline" href={ROUTES.admin.manufacturingJobs}>
                    Open job register
                  </Link>
                }
              >
                <div className="space-y-3">
                  {payload.recent_jobs.length === 0 ? (
                    <ERPEmptyState
                      title="No production jobs yet"
                      description="Released furniture jobs will appear here once manufacturing operations start."
                    />
                  ) : (
                    payload.recent_jobs.map((job) => (
                        <Link
                          key={job.id}
                          href={buildAdminManufacturingJobRoute(job.id)}
                          className="block rounded-xl border border-border bg-card px-4 py-3 transition hover:bg-muted/30 hover:border-ring"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="font-medium text-foreground">
                                {job.job_no} · {job.finished_good_product_name || job.finished_good_sku || "Finished good"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {job.status} · Planned {job.planned_output_qty} · Output {job.completed_output_qty}
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{job.accounting_status}</div>
                            <div>WIP ₹{Number(job.wip_cost || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </ERPSectionShell>

              <ERPSectionShell
                title="Recent BOMs"
                description="BOM revisions stay anchored to the shared finished-good and raw-material inventory profiles."
                actions={
                  <Link className="text-sm font-medium text-primary underline" href={ROUTES.admin.manufacturingBoms}>
                    Open BOM register
                  </Link>
                }
              >
                <div className="space-y-3">
                  {payload.recent_boms.length === 0 ? (
                    <ERPEmptyState
                      title="No BOMs yet"
                      description="Once BOMs are prepared for furniture production, they will appear here."
                    />
                  ) : (
                    payload.recent_boms.map((bom) => (
                      <div
                        key={bom.id}
                        className="rounded-xl border border-border bg-card px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium text-foreground">
                              {bom.bom_no} · {bom.finished_good_product_name || bom.finished_good_sku || "Finished good"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Revision {bom.revision_no} · {bom.status} · {bom.line_count} lines
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{bom.is_default ? "Default" : "Revision"}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ERPSectionShell>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
