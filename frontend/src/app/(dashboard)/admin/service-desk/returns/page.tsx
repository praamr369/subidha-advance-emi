"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import DataTable from "@/components/ui/DataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ApprovalQueuePageShell } from "@/components/layout/page-shells";
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
  return "Unable to load the return register.";
}

export default function AdminServiceDeskReturnsPage() {
  const searchParams = useSearchParams();
  const isRentLeaseInspection = searchParams?.get("plan_type") === "RENT_LEASE";

  const [rows, setRows] = useState<ServiceDeskCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    case_type: "SALES_RETURN",
    issue_summary: "",
    issue_details: "",
    direct_sale: "",
    subscription: "",
    delivery: "",
    billing_invoice: "",
    support_request: "",
    reporter_name_snapshot: "",
    reporter_phone_snapshot: "",
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
      const next = await listServiceDeskCases({
        case_type: "SALES_RETURN",
      });
      const exchange = await listServiceDeskCases({
        case_type: "EXCHANGE",
      });
      const deliveryReturns = await listServiceDeskCases({
        case_type: "DELIVERY_RETURN",
      });
      setRows([...next.results, ...exchange.results, ...deliveryReturns.results].sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || "")));
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

  async function handleCreateCase() {
    if (!form.issue_summary.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const hasLine =
        form.line_description.trim() &&
        (Number(form.quantity) > 0 || Number(form.taxable_amount) > 0 || Number(form.tax_amount) > 0);

      await createServiceDeskCase({
        case_type: form.case_type as ServiceDeskCase["case_type"],
        issue_summary: form.issue_summary,
        issue_details: form.issue_details,
        direct_sale: form.direct_sale ? Number(form.direct_sale) : null,
        subscription: form.subscription ? Number(form.subscription) : null,
        delivery: form.delivery ? Number(form.delivery) : null,
        billing_invoice: form.billing_invoice ? Number(form.billing_invoice) : null,
        support_request: form.support_request ? Number(form.support_request) : null,
        reporter_name_snapshot: form.reporter_name_snapshot,
        reporter_phone_snapshot: form.reporter_phone_snapshot,
        credit_note_required: form.case_type !== "DELIVERY_RETURN",
        stock_resolution_required: true,
        lines: hasLine
          ? [
              {
                product: form.product ? Number(form.product) : null,
                inventory_item: form.inventory_item ? Number(form.inventory_item) : null,
                description: form.line_description,
                quantity: form.quantity,
                disposition: form.case_type === "EXCHANGE" ? "REPLACE" : "RESTOCK",
                taxable_amount: form.taxable_amount,
                tax_amount: form.tax_amount,
              },
            ]
          : [],
      });
      setNotice("Return case created.");
      setForm({
        case_type: "SALES_RETURN",
        issue_summary: "",
        issue_details: "",
        direct_sale: "",
        subscription: "",
        delivery: "",
        billing_invoice: "",
        support_request: "",
        reporter_name_snapshot: "",
        reporter_phone_snapshot: "",
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
        title: "Case",
        render: (row: ServiceDeskCase) => (
          <div>
            <div className="font-medium text-foreground">{row.case_no}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
          </div>
        ),
      },
      { key: "case_type", title: "Type" },
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
      { key: "finance_status", title: "Finance" },
      { key: "stock_status", title: "Stock" },
    ],
    []
  );

  return (
    <PortalPage
      title="Return Register"
      subtitle="Sales returns, delivery returns, and exchanges are captured as explicit service-desk cases. Stock and finance effects only happen through the linked delivery or billing-note actions on the case detail."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: "Returns" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskComplaints, label: "Complaints", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskTickets, label: "Service Tickets", variant: "secondary" },
      ]}
      stats={[
        { label: "Visible", value: String(rows.length), tone: "info" },
        {
          label: "Authorized",
          value: String(rows.filter((item) => item.status === "AUTHORIZED").length),
        },
        {
          label: "Finance Pending",
          value: String(rows.filter((item) => item.finance_status === "PENDING").length),
          tone: "warning",
        },
        {
          label: "Stock Pending",
          value: String(rows.filter((item) => item.stock_status === "PENDING").length),
          tone: "warning",
        },
      ]}
      statusBadge={{ label: isRentLeaseInspection ? "Rent/Lease Return Inspection" : "Return Workflow", tone: "info" }}
    >
      {isRentLeaseInspection ? (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm">
          <p className="font-semibold text-blue-900">Rent/Lease Return Inspection Workflow</p>
          <p className="mt-1 text-blue-800">
            Rent and lease return inspections (condition grading, damage assessment, deposit deduction decisions)
            are managed from the{" "}
            <strong>Subscription Lifecycle page</strong> for each contract. Navigate to the relevant
            subscription and use the &quot;Return Inspection&quot; section there to:
          </p>
          <ul className="mt-2 list-disc pl-5 text-blue-800 space-y-1">
            <li>Initiate a return inspection record</li>
            <li>Record condition (GOOD / FAIR / DAMAGED) and damage notes</li>
            <li>Specify deposit deduction amount and reason</li>
            <li>Approve the inspection to release or deduct the security deposit</li>
            <li>Download inspection PDF for legal records</li>
          </ul>
          <div className="mt-3">
            <a
              href={ROUTES.admin.subscriptions}
              className="inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Go to Subscriptions →
            </a>
          </div>
          <p className="mt-3 text-xs text-blue-700">
            This return register below shows service-desk cases for sales returns, delivery returns,
            and exchanges — not rent/lease return inspections.
          </p>
        </div>
      ) : null}
      <ApprovalQueuePageShell
        queueSummary={
          notice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null
        }
        queueList={
          <>
            {loading ? <LoadingBlock label="Loading return register..." /> : null}
            {!loading && error ? (
              <ErrorState title="Return register unavailable" description={error} onRetry={() => void loadPage()} />
            ) : null}
            {!loading && !error ? (
              <DataTable
                columns={columns}
                rows={rows}
                emptyText="No return cases found."
                onRowClick={(row) => {
                  window.location.href = buildAdminServiceDeskCaseRoute(row.id);
                }}
              />
            ) : null}
          </>
        }
        detailPane={
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm">
              <span>Case Type</span>
              <select
                value={form.case_type}
                onChange={(event) => setForm((current) => ({ ...current, case_type: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              >
                <option value="SALES_RETURN">Sales Return</option>
                <option value="DELIVERY_RETURN">Delivery Return</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>Issue Summary</span>
              <input
                value={form.issue_summary}
                onChange={(event) => setForm((current) => ({ ...current, issue_summary: event.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2"
              />
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
              onClick={() => void handleCreateCase()}
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Return Case"}
            </button>
          </div>
        </section>
        }
      />
    </PortalPage>
  );
}
