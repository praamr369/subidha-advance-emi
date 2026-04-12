"use client";

import { useEffect, useMemo, useState } from "react";

import DataTable from "@/components/ui/DataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createServiceDeskCase,
  listServiceDeskCases,
  type ServiceDeskCase,
} from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the service ticket register.";
}

export default function AdminServiceDeskTicketsPage() {
  const [rows, setRows] = useState<ServiceDeskCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    issue_summary: "",
    issue_details: "",
    support_request: "",
    direct_sale: "",
    subscription: "",
    delivery: "",
    billing_invoice: "",
    reporter_name_snapshot: "",
    reporter_phone_snapshot: "",
    warranty_status: "UNKNOWN",
    debit_note_required: false,
    product: "",
    inventory_item: "",
    line_description: "",
    quantity: "1.000",
    taxable_amount: "0.00",
    tax_amount: "0.00",
  });

  async function loadPage() {
    try {
      setLoading(true);
      const next = await listServiceDeskCases({ case_type: "SERVICE" });
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

  async function handleCreateTicket() {
    if (!form.issue_summary.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const hasLine =
        form.line_description.trim() &&
        (Number(form.quantity) > 0 || Number(form.taxable_amount) > 0 || Number(form.tax_amount) > 0);
      await createServiceDeskCase({
        case_type: "SERVICE",
        issue_summary: form.issue_summary,
        issue_details: form.issue_details,
        support_request: form.support_request ? Number(form.support_request) : null,
        direct_sale: form.direct_sale ? Number(form.direct_sale) : null,
        subscription: form.subscription ? Number(form.subscription) : null,
        delivery: form.delivery ? Number(form.delivery) : null,
        billing_invoice: form.billing_invoice ? Number(form.billing_invoice) : null,
        reporter_name_snapshot: form.reporter_name_snapshot,
        reporter_phone_snapshot: form.reporter_phone_snapshot,
        warranty_status: form.warranty_status,
        debit_note_required: form.debit_note_required,
        stock_resolution_required: Boolean(form.inventory_item),
        lines: hasLine
          ? [
              {
                product: form.product ? Number(form.product) : null,
                inventory_item: form.inventory_item ? Number(form.inventory_item) : null,
                description: form.line_description,
                quantity: form.quantity,
                disposition: "REPAIR",
                taxable_amount: form.taxable_amount,
                tax_amount: form.tax_amount,
              },
            ]
          : [],
      });
      setNotice("Service ticket created.");
      setForm({
        issue_summary: "",
        issue_details: "",
        support_request: "",
        direct_sale: "",
        subscription: "",
        delivery: "",
        billing_invoice: "",
        reporter_name_snapshot: "",
        reporter_phone_snapshot: "",
        warranty_status: "UNKNOWN",
        debit_note_required: false,
        product: "",
        inventory_item: "",
        line_description: "",
        quantity: "1.000",
        taxable_amount: "0.00",
        tax_amount: "0.00",
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
        key: "case_no",
        title: "Ticket",
        render: (row: ServiceDeskCase) => (
          <div>
            <div className="font-medium text-foreground">{row.case_no}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
          </div>
        ),
      },
      {
        key: "issue_summary",
        title: "Issue",
        render: (row: ServiceDeskCase) => (
          <div className="max-w-xl">
            <div className="font-medium text-foreground">{row.issue_summary}</div>
            <div className="text-xs text-muted-foreground">
              {row.billing_invoice_no || row.direct_sale_no || row.delivery_reference || "No source linked"}
            </div>
          </div>
        ),
      },
      { key: "status", title: "Case Status" },
      { key: "warranty_status", title: "Warranty" },
      { key: "finance_status", title: "Finance" },
      { key: "stock_status", title: "Stock" },
    ],
    []
  );

  return (
    <PortalPage
      title="Service Tickets"
      subtitle="After-sales service stays inside explicit tickets. Warranty posture, optional charge notes, and optional stock issues are visible on the case without turning billing or accounting into the operational owner of the workflow."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: "Service Tickets" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskComplaints, label: "Complaints", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Returns", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible", value: String(rows.length), tone: "info" },
        { label: "In Service", value: String(rows.filter((item) => item.status === "IN_SERVICE").length) },
        {
          label: "Debit Pending",
          value: String(rows.filter((item) => item.debit_note_required && item.finance_status !== "POSTED").length),
          tone: "warning",
        },
        { label: "Warranty", value: String(rows.filter((item) => item.warranty_status === "IN_WARRANTY").length) },
      ]}
      statusBadge={{ label: "After-Sales Service", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {loading ? <LoadingBlock label="Loading service tickets..." /> : null}
        {!loading && error ? (
          <ErrorState title="Service ticket register unavailable" description={error} onRetry={() => void loadPage()} />
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>Issue Summary</span>
              <input
                value={form.issue_summary}
                onChange={(event) => setForm((current) => ({ ...current, issue_summary: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Warranty Status</span>
              <select
                value={form.warranty_status}
                onChange={(event) => setForm((current) => ({ ...current, warranty_status: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="IN_WARRANTY">In Warranty</option>
                <option value="OUT_OF_WARRANTY">Out Of Warranty</option>
                <option value="GOODWILL">Goodwill</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>Charge Note Needed</span>
              <select
                value={form.debit_note_required ? "YES" : "NO"}
                onChange={(event) =>
                  setForm((current) => ({ ...current, debit_note_required: event.target.value === "YES" }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              >
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>Billing Invoice ID</span>
              <input
                value={form.billing_invoice}
                onChange={(event) => setForm((current) => ({ ...current, billing_invoice: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Direct Sale ID</span>
              <input
                value={form.direct_sale}
                onChange={(event) => setForm((current) => ({ ...current, direct_sale: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Subscription ID</span>
              <input
                value={form.subscription}
                onChange={(event) => setForm((current) => ({ ...current, subscription: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Delivery ID</span>
              <input
                value={form.delivery}
                onChange={(event) => setForm((current) => ({ ...current, delivery: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Support Request ID</span>
              <input
                value={form.support_request}
                onChange={(event) => setForm((current) => ({ ...current, support_request: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Reporter Name</span>
              <input
                value={form.reporter_name_snapshot}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reporter_name_snapshot: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Reporter Phone</span>
              <input
                value={form.reporter_phone_snapshot}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reporter_phone_snapshot: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>Issue Details</span>
              <textarea
                rows={4}
                value={form.issue_details}
                onChange={(event) => setForm((current) => ({ ...current, issue_details: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="grid gap-2 text-sm">
              <span>Product ID</span>
              <input
                value={form.product}
                onChange={(event) => setForm((current) => ({ ...current, product: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Inventory Item ID</span>
              <input
                value={form.inventory_item}
                onChange={(event) => setForm((current) => ({ ...current, inventory_item: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm xl:col-span-2">
              <span>Line Description</span>
              <input
                value={form.line_description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, line_description: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Quantity</span>
              <input
                value={form.quantity}
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Taxable Amount</span>
              <input
                value={form.taxable_amount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, taxable_amount: event.target.value }))
                }
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Tax Amount</span>
              <input
                value={form.tax_amount}
                onChange={(event) => setForm((current) => ({ ...current, tax_amount: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreateTicket()}
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Service Ticket"}
            </button>
          </div>
        </section>

        {!loading && !error ? (
          <DataTable
            columns={columns}
            rows={rows}
            emptyText="No service tickets found."
            onRowClick={(row) => {
              window.location.href = buildAdminServiceDeskCaseRoute(row.id);
            }}
          />
        ) : null}
      </div>
    </PortalPage>
  );
}

