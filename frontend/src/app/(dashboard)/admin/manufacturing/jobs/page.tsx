"use client";

import { useEffect, useMemo, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminManufacturingJobRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createProductionJob,
  listProductionJobs,
  type ProductionJob,
} from "@/services/manufacturing";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the production job register.";
}

export default function AdminManufacturingJobsPage() {
  const [rows, setRows] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    job_date: new Date().toISOString().slice(0, 10),
    finished_good_inventory_item: "",
    bom: "",
    stock_location: "",
    planned_output_qty: "1.000",
    notes: "",
  });

  async function loadPage() {
    try {
      setLoading(true);
      const next = await listProductionJobs();
      setRows(next.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  async function handleCreateJob() {
    if (!form.finished_good_inventory_item.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      await createProductionJob({
        job_date: form.job_date,
        finished_good_inventory_item: Number(form.finished_good_inventory_item),
        bom: form.bom ? Number(form.bom) : null,
        stock_location: form.stock_location ? Number(form.stock_location) : null,
        planned_output_qty: form.planned_output_qty,
        notes: form.notes,
      });
      setNotice("Production job created.");
      setForm({
        job_date: new Date().toISOString().slice(0, 10),
        finished_good_inventory_item: "",
        bom: "",
        stock_location: "",
        planned_output_qty: "1.000",
        notes: "",
      });
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "job_no",
        title: "Job",
        render: (row: ProductionJob) => (
          <div>
            <div className="font-medium text-foreground">{row.job_no}</div>
            <div className="text-xs text-muted-foreground">{row.job_date}</div>
          </div>
        ),
      },
      {
        key: "finished_good_product_name",
        title: "Finished Good",
        render: (row: ProductionJob) => row.finished_good_product_name || row.finished_good_sku || "—",
      },
      { key: "status", title: "Status" },
      {
        key: "planned_output_qty",
        title: "Output",
        render: (row: ProductionJob) => `${row.completed_output_qty} / ${row.planned_output_qty}`,
      },
      { key: "wip_cost", title: "WIP Cost", render: (row: ProductionJob) => `₹${Number(row.wip_cost || 0).toFixed(2)}` },
      { key: "accounting_status", title: "Accounting" },
    ],
    []
  );

  return (
    <PortalPage
      title="Production Jobs"
      subtitle="Release furniture jobs only when BOM and material planning are ready. Raw issue, output receipt, scrap capture, and job completion stay explicit and auditable."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing", href: ROUTES.admin.manufacturing },
        { label: "Production Jobs" },
      ]}
      actions={[
        { href: ROUTES.admin.manufacturing, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.manufacturingBoms, label: "BOM Register", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible", value: String(rows.length), tone: "info" },
        { label: "Released", value: String(rows.filter((item) => item.status === "RELEASED").length) },
        { label: "In Progress", value: String(rows.filter((item) => item.status === "IN_PROGRESS").length) },
        { label: "Completed", value: String(rows.filter((item) => item.status === "COMPLETED").length) },
      ]}
      statusBadge={{ label: "Production Control", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {loading ? <LoadingBlock label="Loading production jobs..." /> : null}
        {!loading && error ? (
          <ErrorState title="Production jobs unavailable" description={error} onRetry={() => void loadPage()} />
        ) : null}

        <WorkspaceSection
          title="Create Production Job"
          description="Use a BOM-backed job when available so material planning can seed from the active revision. Procurement remains the source of raw inward; production only consumes and converts stock."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-2 text-sm">
              <span>Job Date</span>
              <input
                type="date"
                value={form.job_date}
                onChange={(event) => setForm((current) => ({ ...current, job_date: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Finished Good Inventory Item ID</span>
              <input
                value={form.finished_good_inventory_item}
                onChange={(event) =>
                  setForm((current) => ({ ...current, finished_good_inventory_item: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>BOM ID</span>
              <input
                value={form.bom}
                onChange={(event) => setForm((current) => ({ ...current, bom: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Stock Location ID</span>
              <input
                value={form.stock_location}
                onChange={(event) => setForm((current) => ({ ...current, stock_location: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Planned Output Qty</span>
              <input
                value={form.planned_output_qty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, planned_output_qty: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2 xl:col-span-5">
              <span>Notes</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void handleCreateJob()}
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create Production Job"}
            </button>
          </div>
        </WorkspaceSection>

        {!loading && !error ? (
          <WorkspaceSection
            title="Production Job Register"
            description="Open the job detail to release the work order, post material issue, receive finished goods, record scrap, and complete the job."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyText="No production jobs found."
              onRowClick={(row) => {
                window.location.href = buildAdminManufacturingJobRoute(row.id);
              }}
            />
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
