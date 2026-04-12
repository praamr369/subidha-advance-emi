"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  cancelProductionJob,
  completeProductionJob,
  getProductionJob,
  postProductionMaterials,
  postProductionOutput,
  releaseProductionJob,
  type ProductionJob,
} from "@/services/manufacturing";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the production job.";
}

function money(value?: string | null): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

export default function AdminManufacturingJobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<ProductionJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [materialForm, setMaterialForm] = useState({
    movement_date: new Date().toISOString().slice(0, 10),
    entry_kind: "ISSUE",
    inventory_item: "",
    quantity: "",
    unit_cost_snapshot: "",
    notes: "",
  });
  const [outputForm, setOutputForm] = useState({
    output_date: new Date().toISOString().slice(0, 10),
    receipt_quantity: "",
    receipt_unit_cost: "",
    scrap_inventory_item: "",
    scrap_quantity: "",
    scrap_unit_cost: "",
    scrap_reason: "",
    notes: "",
  });

  const loadPage = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      setError("Production job id is missing.");
      return;
    }

    try {
      setLoading(true);
      const next = await getProductionJob(jobId);
      setJob(next);
      setError(null);
    } catch (err) {
      setJob(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleRelease() {
    if (!job) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await releaseProductionJob(job.id);
      setJob(response.job);
      setNotice("Production job released.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostDraftMaterials() {
    if (!job) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await postProductionMaterials(job.id, {
        movement_date: materialForm.movement_date,
      });
      setJob(response.job);
      setNotice("Pending material lines posted.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostMaterialBatch() {
    if (!job || !materialForm.inventory_item.trim() || !materialForm.quantity.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await postProductionMaterials(job.id, {
        movement_date: materialForm.movement_date,
        lines: [
          {
            inventory_item: Number(materialForm.inventory_item),
            entry_kind: materialForm.entry_kind as "ISSUE" | "RETURN",
            quantity: materialForm.quantity,
            unit_cost_snapshot: materialForm.unit_cost_snapshot || undefined,
            notes: materialForm.notes,
          },
        ],
      });
      setJob(response.job);
      setNotice(
        materialForm.entry_kind === "RETURN"
          ? "Material return correction posted."
          : "Material issue batch posted."
      );
      setMaterialForm({
        movement_date: new Date().toISOString().slice(0, 10),
        entry_kind: "ISSUE",
        inventory_item: "",
        quantity: "",
        unit_cost_snapshot: "",
        notes: "",
      });
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostOutputBatch() {
    if (!job) return;
    const hasReceipt = outputForm.receipt_quantity.trim();
    const hasScrap = outputForm.scrap_quantity.trim();
    if (!hasReceipt && !hasScrap) return;

    try {
      setSaving(true);
      setNotice(null);
      const response = await postProductionOutput(job.id, {
        output_date: outputForm.output_date,
        receipt_lines: hasReceipt
          ? [
              {
                quantity: outputForm.receipt_quantity,
                unit_cost_snapshot: outputForm.receipt_unit_cost || undefined,
                notes: outputForm.notes,
              },
            ]
          : undefined,
        scrap_lines: hasScrap
          ? [
              {
                inventory_item: outputForm.scrap_inventory_item
                  ? Number(outputForm.scrap_inventory_item)
                  : null,
                quantity: outputForm.scrap_quantity,
                unit_cost_snapshot: outputForm.scrap_unit_cost || undefined,
                reason: outputForm.scrap_reason || undefined,
                notes: outputForm.notes,
              },
            ]
          : undefined,
      });
      setJob(response.job);
      setNotice("Production output batch posted.");
      setOutputForm({
        output_date: new Date().toISOString().slice(0, 10),
        receipt_quantity: "",
        receipt_unit_cost: "",
        scrap_inventory_item: "",
        scrap_quantity: "",
        scrap_unit_cost: "",
        scrap_reason: "",
        notes: "",
      });
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!job) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await completeProductionJob(job.id);
      setJob(response.job);
      setNotice("Production job completed.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!job || !cancelReason.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await cancelProductionJob(job.id, cancelReason);
      setJob(response.job);
      setNotice("Production job cancelled.");
      setCancelReason("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage
      title={job?.job_no || "Production Job"}
      subtitle="This job detail keeps BOM reference, raw issue, WIP, finished-goods receipt, scrap, and costing posture in one operational view while inventory and accounting remain separate posted truths."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing", href: ROUTES.admin.manufacturing },
        { label: "Production Jobs", href: ROUTES.admin.manufacturingJobs },
        { label: job?.job_no || "Detail" },
      ]}
      actions={[
        { href: ROUTES.admin.manufacturing, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.manufacturingBoms, label: "BOM Register", variant: "secondary" },
        { href: ROUTES.admin.manufacturingJobs, label: "Back to Jobs", variant: "secondary" },
      ]}
      stats={[
        { label: "Status", value: job?.status || "—", tone: "info" },
        { label: "Output", value: `${job?.completed_output_qty || "0.000"} / ${job?.planned_output_qty || "0.000"}` },
        { label: "WIP", value: money(job?.wip_cost) },
        { label: "Accounting", value: job?.accounting_status || "—" },
      ]}
      statusBadge={{ label: job?.costing_status || "Job", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading production job..." /> : null}
        {!loading && error && !job ? (
          <ErrorState title="Unable to load the production job" description={error} onRetry={() => void loadPage()} />
        ) : null}
        {!loading && !error && !job ? (
          <EmptyState title="Job not found" description="The requested production job could not be loaded." />
        ) : null}

        {job ? (
          <>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <WorkspaceSection
                title="Job Summary"
                description="The production job tracks WIP and operational progress while stock ledger and accounting bridge entries remain the posted system of record."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="Finished Good" value={job.finished_good_product_name || job.finished_good_sku || "—"} />
                  <DetailItem label="BOM" value={job.bom_no || "Manual"} />
                  <DetailItem label="Location" value={job.stock_location_name || job.stock_location_code || "—"} />
                  <DetailItem label="Created By" value={job.created_by_username || "—"} />
                  <DetailItem label="Released At" value={formatDateTime(job.released_at)} />
                  <DetailItem label="Started At" value={formatDateTime(job.started_at)} />
                  <DetailItem label="Completed At" value={formatDateTime(job.completed_at)} />
                  <DetailItem label="Posting Notes" value={job.posting_notes || "—"} />
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm text-foreground">
                  {job.notes || "No job notes recorded."}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Cost and WIP"
                description="Issued raw cost, received finished-good cost, and scrap cost stay visible here so operators can close jobs only when WIP is settled."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="Issued Cost" value={money(job.total_issued_cost)} />
                  <DetailItem label="Received Cost" value={money(job.total_received_cost)} />
                  <DetailItem label="Scrap Cost" value={money(job.total_scrap_cost)} />
                  <DetailItem label="Current WIP" value={money(job.wip_cost)} />
                  <DetailItem label="Costing Status" value={job.costing_status} />
                  <DetailItem label="Accounting Status" value={job.accounting_status} />
                </div>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Job Actions"
              description="Release, issue, receive, complete, or cancel the job through explicit production actions only."
            >
              <div className="flex flex-wrap gap-3">
                {job.status === "DRAFT" ? (
                  <button
                    type="button"
                    onClick={() => void handleRelease()}
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    Release Job
                  </button>
                ) : null}
                {job.status === "RELEASED" || job.status === "IN_PROGRESS" ? (
                  <button
                    type="button"
                    onClick={() => void handleComplete()}
                    disabled={saving}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  >
                    Complete Job
                  </button>
                ) : null}
              </div>

              {job.status === "DRAFT" || job.status === "RELEASED" ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Cancellation reason"
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={saving || !cancelReason.trim()}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  >
                    Cancel Job
                  </button>
                </div>
              ) : null}
            </WorkspaceSection>

            <div className="grid gap-6 xl:grid-cols-2">
              <WorkspaceSection
                title="Material Movement"
                description="Post the seeded BOM lines as a batch, or post an explicit issue/return correction line when the production floor needs an adjustment."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span>Movement Date</span>
                    <input
                      type="date"
                      value={materialForm.movement_date}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, movement_date: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Batch Kind</span>
                    <select
                      value={materialForm.entry_kind}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, entry_kind: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <option value="ISSUE">Issue</option>
                      <option value="RETURN">Return Correction</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Inventory Item ID</span>
                    <input
                      value={materialForm.inventory_item}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, inventory_item: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Quantity</span>
                    <input
                      value={materialForm.quantity}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, quantity: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Unit Cost Snapshot</span>
                    <input
                      value={materialForm.unit_cost_snapshot}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, unit_cost_snapshot: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm md:col-span-2">
                    <span>Notes</span>
                    <input
                      value={materialForm.notes}
                      onChange={(event) =>
                        setMaterialForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePostDraftMaterials()}
                    disabled={saving}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  >
                    Post Pending Draft Materials
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePostMaterialBatch()}
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    Post Material Batch
                  </button>
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Output and Scrap"
                description="Receive finished goods and record scrap explicitly. The job can only complete after WIP clears."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span>Output Date</span>
                    <input
                      type="date"
                      value={outputForm.output_date}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, output_date: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Receipt Quantity</span>
                    <input
                      value={outputForm.receipt_quantity}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, receipt_quantity: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Receipt Unit Cost</span>
                    <input
                      value={outputForm.receipt_unit_cost}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, receipt_unit_cost: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Scrap Inventory Item ID</span>
                    <input
                      value={outputForm.scrap_inventory_item}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, scrap_inventory_item: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Scrap Quantity</span>
                    <input
                      value={outputForm.scrap_quantity}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, scrap_quantity: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Scrap Unit Cost</span>
                    <input
                      value={outputForm.scrap_unit_cost}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, scrap_unit_cost: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Scrap Reason</span>
                    <input
                      value={outputForm.scrap_reason}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, scrap_reason: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm md:col-span-2">
                    <span>Batch Notes</span>
                    <input
                      value={outputForm.notes}
                      onChange={(event) =>
                        setOutputForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePostOutputBatch()}
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    Post Output Batch
                  </button>
                </div>
              </WorkspaceSection>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <WorkspaceSection
                title="Material Lines"
                description="Issue and return-correction lines keep raw-material consumption explicit."
              >
                <div className="space-y-3">
                  {job.material_issue_lines.length === 0 ? (
                    <EmptyState title="No material lines" description="Release the job or post a material batch to create material movement lines." />
                  ) : (
                    job.material_issue_lines.map((line) => (
                      <div key={line.id} className="rounded-2xl border border-border bg-background/70 p-3 text-sm">
                        <div className="font-medium text-foreground">
                          {line.entry_kind} · {line.inventory_item_product_name || line.inventory_item_sku || `Item ${line.inventory_item}`}
                        </div>
                        <div className="text-muted-foreground">
                          Qty {line.quantity} · Cost {money(line.line_total_cost)} · {line.is_posted ? "Posted" : "Draft"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Receipt Lines"
                description="Finished-goods receipt lines increase stock only when posted through the job output action."
              >
                <div className="space-y-3">
                  {job.receipt_lines.length === 0 ? (
                    <EmptyState title="No receipt lines" description="Post an output batch to receive finished goods." />
                  ) : (
                    job.receipt_lines.map((line) => (
                      <div key={line.id} className="rounded-2xl border border-border bg-background/70 p-3 text-sm">
                        <div className="font-medium text-foreground">
                          {line.inventory_item_product_name || line.inventory_item_sku || `Item ${line.inventory_item}`}
                        </div>
                        <div className="text-muted-foreground">
                          Qty {line.quantity} · Cost {money(line.line_total_cost)} · {line.is_posted ? "Posted" : "Draft"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Scrap Lines"
                description="Scrap stays explicit at the production job and reduces WIP through controlled posting."
              >
                <div className="space-y-3">
                  {job.scrap_lines.length === 0 ? (
                    <EmptyState title="No scrap lines" description="Record wastage only when it belongs to this job." />
                  ) : (
                    job.scrap_lines.map((line) => (
                      <div key={line.id} className="rounded-2xl border border-border bg-background/70 p-3 text-sm">
                        <div className="font-medium text-foreground">{line.reason}</div>
                        <div className="text-muted-foreground">
                          Qty {line.quantity} · Cost {money(line.line_total_cost)} · {line.is_posted ? "Posted" : "Draft"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
