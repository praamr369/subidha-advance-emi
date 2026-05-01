"use client";

import Link from "next/link";
import { Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { createDirectSale, listDirectSales, type DirectSale, type DirectSaleLine } from "@/services/billing";
import { searchCustomers, type CustomerRecord } from "@/services/customers";
import {
  searchBillingProducts,
  type BillingProductSearchRow,
} from "@/services/direct-sale-workspace";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingInvoicesRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type DraftLine = {
  id: string;
  product_id: string;
  inventory_item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  gst_rate: string;
  product_search: string;
  product_results: BillingProductSearchRow[];
  product_loading: boolean;
  product_error: string | null;
  selected_product: BillingProductSearchRow | null;
  create_requirement: boolean;
  requirement_quantity: string;
  requirement_note: string;
};

type FormState = {
  sale_date: string;
  customer_id: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string;
  customer_gstin: string;
  tax_mode: "GST" | "NON_GST";
  finance_account: string;
  delivery_required: boolean;
  received_total: string;
  notes: string;
};

type LineTotals = {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  lineTotal: number;
};

function makeLine(): DraftLine {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    product_id: "",
    inventory_item_id: "",
    description: "",
    quantity: "1.000",
    unit_price: "0.00",
    discount_amount: "0.00",
    gst_rate: "0.00",
    product_search: "",
    product_results: [],
    product_loading: false,
    product_error: null,
    selected_product: null,
    create_requirement: false,
    requirement_quantity: "1.000",
    requirement_note: "",
  };
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function quantity(value: number): string {
  return value.toFixed(3);
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function calculateLine(line: DraftLine, taxMode: "GST" | "NON_GST"): LineTotals {
  const qty = Math.max(toNumber(line.quantity), 0);
  const price = Math.max(toNumber(line.unit_price), 0);
  const gross = qty * price;
  const discount = Math.max(toNumber(line.discount_amount), 0);
  const taxable = Math.max(gross - discount, 0);
  const gstRate = taxMode === "GST" ? Math.max(toNumber(line.gst_rate), 0) : 0;
  const tax = taxable * (gstRate / 100);
  return {
    gross,
    discount,
    taxable,
    tax,
    lineTotal: taxable + tax,
  };
}

function buildLinePayload(line: DraftLine, taxMode: "GST" | "NON_GST"): DirectSaleLine {
  const totals = calculateLine(line, taxMode);
  const gstRate = taxMode === "GST" ? Math.max(toNumber(line.gst_rate), 0) : 0;
  const cgst = taxMode === "GST" ? totals.tax / 2 : 0;
  const sgst = taxMode === "GST" ? totals.tax / 2 : 0;
  return {
    product: Number(line.product_id),
    inventory_item: line.inventory_item_id ? Number(line.inventory_item_id) : null,
    description: line.description.trim(),
    quantity: quantity(Math.max(toNumber(line.quantity), 0)),
    unit_price: money(Math.max(toNumber(line.unit_price), 0)),
    discount_amount: money(Math.max(toNumber(line.discount_amount), 0)),
    taxable_value: money(totals.taxable),
    gst_rate: taxMode === "GST" ? money(gstRate) : null,
    cgst_amount: money(cgst),
    sgst_amount: money(sgst),
    igst_amount: "0.00",
    line_total: money(totals.lineTotal),
    hsn_sac_code: "",
    create_purchase_requirement: line.create_requirement,
    requirement_quantity: line.create_requirement
      ? quantity(Math.max(toNumber(line.requirement_quantity), 0))
      : null,
    requirement_note: line.requirement_note.trim(),
  };
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `direct-sale-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function DirectSaleWorkspace() {
  const [rows, setRows] = useState<DirectSale[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<FormState>({
    sale_date: todayIso(),
    customer_id: "",
    customer_name_snapshot: "",
    customer_phone_snapshot: "",
    customer_gstin: "",
    tax_mode: "NON_GST",
    finance_account: "",
    delivery_required: false,
    received_total: "0.00",
    notes: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([makeLine()]);
  const lineSearchTimers = useRef<Record<string, number>>({});
  const customerSearchTimer = useRef<number | null>(null);
  const createAttemptKey = useRef<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [salesPayload, accountsPayload] = await Promise.all([
        listDirectSales(),
        listFinanceAccounts(),
      ]);
      setRows(salesPayload.results);
      setFinanceAccounts(accountsPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setFinanceAccounts([]);
      setError(accountingErrorMessage(err, "Failed to load direct-sale workspace."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const stats = useMemo(() => {
    const today = todayIso();
    const draftSales = rows.filter((row) => row.status === "DRAFT").length;
    const todaySales = rows.filter((row) => row.sale_date === today).length;
    const deliveryHold = rows.filter((row) => row.delivery_required && !row.delivered_at).length;
    return { draftSales, todaySales, deliveryHold };
  }, [rows]);

  const computedLines = useMemo(
    () =>
      lines.map((line) => ({
        line,
        totals: calculateLine(line, form.tax_mode),
      })),
    [form.tax_mode, lines]
  );

  const totals = useMemo(() => {
    const rollup = computedLines.reduce(
      (acc, entry) => {
        acc.subtotal += entry.totals.gross;
        acc.discount += entry.totals.discount;
        acc.taxable += entry.totals.taxable;
        acc.tax += entry.totals.tax;
        acc.grand += entry.totals.lineTotal;
        return acc;
      },
      { subtotal: 0, discount: 0, taxable: 0, tax: 0, grand: 0 }
    );
    const received = Math.max(toNumber(form.received_total), 0);
    return {
      ...rollup,
      received,
      balance: rollup.grand - received,
    };
  }, [computedLines, form.received_total]);

  const columns: EnterpriseColumnDef<DirectSale>[] = [
    {
      key: "sale_no",
      header: "Sale",
      render: (row) => row.sale_no || `Draft ${row.id}`,
    },
    {
      key: "sale_date",
      header: "Date",
      render: (row) => accountingDate(row.sale_date),
    },
    {
      key: "customer_name_snapshot",
      header: "Customer",
      render: (row) => row.customer_name_snapshot || row.customer_name || "Walk-in",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => row.status,
    },
    {
      key: "grand_total",
      header: "Amount",
      render: (row) => accountingMoney(row.grand_total),
    },
    {
      key: "delivery_required",
      header: "Delivery",
      render: (row) =>
        row.delivery_required
          ? row.delivered_at
            ? "Delivered"
            : "Hold"
          : "Counter sale",
    },
    {
      key: "billing_invoice_no",
      header: "Invoice",
      render: (row) =>
        row.billing_invoice_id ? (
          <Link
            href={buildAdminBillingDocumentRoute(row.billing_invoice_id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.billing_invoice_no || `Invoice ${row.billing_invoice_id}`}
          </Link>
        ) : (
          "Draft"
        ),
    },
  ];

  function resetCreateForm() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setForm({
      sale_date: todayIso(),
      customer_id: "",
      customer_name_snapshot: "",
      customer_phone_snapshot: "",
      customer_gstin: "",
      tax_mode: "NON_GST",
      finance_account: "",
      delivery_required: false,
      received_total: "0.00",
      notes: "",
    });
    setLines([makeLine()]);
    setValidationErrors([]);
    createAttemptKey.current = null;
  }

  function updateLine(lineId: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
    setNotice(null);
  }

  function handleCustomerSearch(value: string) {
    setCustomerQuery(value);
    if (customerSearchTimer.current) {
      window.clearTimeout(customerSearchTimer.current);
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      setCustomerLoading(false);
      return;
    }
    setCustomerLoading(true);
    customerSearchTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(trimmed);
        setCustomerResults(results);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerLoading(false);
      }
    }, 250);
  }

  function selectCustomer(customer: CustomerRecord) {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.name} ${customer.phone}`.trim());
    setCustomerResults([]);
    setForm((current) => ({
      ...current,
      customer_id: String(customer.id),
      customer_name_snapshot: customer.name || current.customer_name_snapshot,
      customer_phone_snapshot: customer.phone || current.customer_phone_snapshot,
    }));
  }

  function handleProductSearch(lineId: string, value: string) {
    updateLine(lineId, {
      product_search: value,
      product_error: null,
      product_loading: value.trim().length >= 2,
    });
    if (lineSearchTimers.current[lineId]) {
      window.clearTimeout(lineSearchTimers.current[lineId]);
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      updateLine(lineId, { product_results: [], product_loading: false });
      return;
    }
    lineSearchTimers.current[lineId] = window.setTimeout(async () => {
      try {
        const payload = await searchBillingProducts({
          q: trimmed,
          page: 1,
          page_size: 20,
          include_inventory: true,
          direct_sale_enabled: true,
        });
        updateLine(lineId, {
          product_results: payload.results,
          product_loading: false,
          product_error: null,
        });
      } catch (err) {
        updateLine(lineId, {
          product_results: [],
          product_loading: false,
          product_error: accountingErrorMessage(err, "Product search failed."),
        });
      }
    }, 250);
  }

  function selectProduct(lineId: string, product: BillingProductSearchRow) {
    const basePrice = product.base_price || product.sale_price || "0.00";
    updateLine(lineId, {
      product_id: String(product.id),
      inventory_item_id: product.inventory_item_id ? String(product.inventory_item_id) : "",
      description: product.name,
      unit_price: Number(basePrice || 0).toFixed(2),
      product_search: `${product.product_code || product.sku || product.id} - ${product.name}`,
      product_results: [],
      product_loading: false,
      selected_product: product,
      requirement_quantity: "1.000",
    });
  }

  function validateForm(): string[] {
    const next: string[] = [];
    if (!form.customer_id && !form.customer_name_snapshot.trim()) {
      next.push("Walk-in customer name or registered customer is required.");
    }
    if (!form.customer_id && !normalizePhone(form.customer_phone_snapshot)) {
      next.push("Walk-in customer phone is required.");
    }
    if (totals.received > totals.grand) {
      next.push("Received total cannot exceed grand total.");
    }
    if (!lines.length) {
      next.push("At least one product line is required.");
    }
    lines.forEach((line, index) => {
      const lineNo = index + 1;
      const calculated = calculateLine(line, form.tax_mode);
      if (!line.product_id) next.push(`Line ${lineNo}: product is required.`);
      if (toNumber(line.quantity) <= 0) next.push(`Line ${lineNo}: quantity must be greater than zero.`);
      if (toNumber(line.unit_price) <= 0) next.push(`Line ${lineNo}: unit price must be greater than zero.`);
      if (toNumber(line.discount_amount) < 0) next.push(`Line ${lineNo}: discount cannot be negative.`);
      if (toNumber(line.discount_amount) > calculated.gross) {
        next.push(`Line ${lineNo}: discount cannot exceed line gross amount.`);
      }
      if (line.create_requirement && toNumber(line.requirement_quantity) <= 0) {
        next.push(`Line ${lineNo}: requirement quantity must be greater than zero.`);
      }
    });
    return next;
  }

  async function submitCreate() {
    if (submitting) return;
    const nextErrors = validateForm();
    setValidationErrors(nextErrors);
    setError(null);
    setNotice(null);
    if (nextErrors.length > 0) return;

    setSubmitting(true);
    createAttemptKey.current = createAttemptKey.current || makeIdempotencyKey();
    try {
      const payload = {
        sale_date: form.sale_date,
        customer: form.customer_id ? Number(form.customer_id) : null,
        tax_mode: form.tax_mode,
        finance_account: form.finance_account ? Number(form.finance_account) : null,
        delivery_required: form.delivery_required,
        customer_name_snapshot: form.customer_name_snapshot.trim(),
        customer_phone_snapshot: normalizePhone(form.customer_phone_snapshot),
        customer_gstin: form.customer_gstin.trim() || null,
        subtotal: money(totals.subtotal),
        discount_total: money(totals.discount),
        taxable_total: money(totals.taxable),
        tax_total: money(totals.tax),
        grand_total: money(totals.grand),
        received_total: money(totals.received),
        balance_total: money(totals.balance),
        notes: form.notes.trim(),
        lines: lines.map((line) => buildLinePayload(line, form.tax_mode)),
      };
      const created = await createDirectSale(payload, {
        idempotencyKey: createAttemptKey.current,
      });
      setNotice(`Direct sale ${created.sale_no || `#${created.id}`} created.`);
      setDrawerOpen(false);
      resetCreateForm();
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create direct sale."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Admin Billing"
      title="Direct Sale Workspace"
      subtitle="Create retail bills from the full product catalog while keeping product base price, EMI contracts, billing discounts, and inventory requirements separate."
      helperNote="Product base price stays unchanged. Discount applies only to this direct-sale bill."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Direct Sale" },
      ]}
      actions={[
        {
          label: "Retail Invoices",
          href: buildAdminBillingInvoicesRoute({ source_type: "DIRECT_SALE" }),
          variant: "secondary",
        },
        {
          label: "Document Register",
          href: ROUTES.admin.billingRegister,
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Draft Sales", value: stats.draftSales, tone: "info" },
        { label: "Today Sales", value: stats.todaySales, tone: "success" },
        { label: "Delivery Hold", value: stats.deliveryHold, tone: stats.deliveryHold ? "warning" : "default" },
        { label: "Recent Sales", value: rows.length, tone: "info" },
      ]}
      statusBadge={{ label: "Retail Billing", tone: "info" }}
    >
      <WorkspaceDirectory
        title="Billing route map"
        description="Move between retail sales, invoices, receipts, documents, and billing books without mixing direct-sale and EMI collection workflows."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Direct Sale Billing Desk</h2>
          <p className="text-sm text-muted-foreground">
            Build cash/upfront bills with line discounts and purchase requirements from real backend endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetCreateForm();
            setDrawerOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Bill
        </button>
      </div>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error && !drawerOpen ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Draft Sales" value={String(stats.draftSales)} tone="info" />
        <StatCard label="Today Sales" value={String(stats.todaySales)} tone="success" />
        <StatCard label="Delivery Hold" value={String(stats.deliveryHold)} tone={stats.deliveryHold ? "warning" : "default"} />
        <StatCard label="Pending Stock Requirements" value="See Inventory Requirements" tone="warning" />
      </section>

      <WorkspaceSection
        title="Recent Direct Sales"
        description="Recent direct-sale bills, linked billing invoices, delivery hold state, customer snapshot, and amount."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No direct-sale bills found"
          emptyDescription="Create a bill to start the retail direct-sale register."
        />
      </WorkspaceSection>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col border-l border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Create Direct Sale Bill</h2>
                <p className="text-sm text-muted-foreground">
                  Product base price stays unchanged. Discount applies only to this direct-sale bill.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                disabled={submitting}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close create bill drawer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Customer</h3>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="relative">
                        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="direct-sale-customer-search">
                          Search Existing Customer
                        </label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <input
                            id="direct-sale-customer-search"
                            value={customerQuery}
                            onChange={(event) => handleCustomerSearch(event.target.value)}
                            disabled={submitting}
                            className={`${FIELD_CLASS} pl-9`}
                            placeholder="Name or phone"
                          />
                        </div>
                        {customerQuery.trim().length >= 2 ? (
                          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                            {customerLoading ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">Searching customers...</div>
                            ) : customerResults.length ? (
                              customerResults.map((customer) => (
                                <button
                                  key={customer.id}
                                  type="button"
                                  onClick={() => selectCustomer(customer)}
                                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                >
                                  <span className="block font-medium">{customer.name}</span>
                                  <span className="block text-xs text-muted-foreground">{customer.phone}</span>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">No matching customer.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">Walk-in / Snapshot Name</span>
                          <input
                            value={form.customer_name_snapshot}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, customer_name_snapshot: event.target.value }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium text-foreground">Phone</span>
                          <input
                            value={form.customer_phone_snapshot}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                customer_phone_snapshot: normalizePhone(event.target.value),
                              }))
                            }
                            disabled={submitting}
                            className={FIELD_CLASS}
                          />
                        </label>
                      </div>
                    </div>
                    {selectedCustomer ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Registered customer selected: {selectedCustomer.name} ({selectedCustomer.phone})
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Bill Details</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Sale Date</span>
                        <input
                          type="date"
                          value={form.sale_date}
                          onChange={(event) => setForm((current) => ({ ...current, sale_date: event.target.value }))}
                          disabled={submitting}
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Tax Mode</span>
                        <select
                          value={form.tax_mode}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, tax_mode: event.target.value as "GST" | "NON_GST" }))
                          }
                          disabled={submitting}
                          className={FIELD_CLASS}
                        >
                          <option value="NON_GST">Non-GST</option>
                          <option value="GST">GST</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Finance Account</span>
                        <select
                          value={form.finance_account}
                          onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))}
                          disabled={submitting}
                          className={FIELD_CLASS}
                        >
                          <option value="">No immediate receipt</option>
                          {financeAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.delivery_required}
                          onChange={(event) => setForm((current) => ({ ...current, delivery_required: event.target.checked }))}
                          disabled={submitting}
                        />
                        Delivery required
                      </label>
                    </div>
                    <label className="mt-4 grid gap-2 text-sm">
                      <span className="font-medium text-foreground">Notes</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        disabled={submitting}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Product Lines</h3>
                      <button
                        type="button"
                        onClick={() => setLines((current) => [...current, makeLine()])}
                        disabled={submitting}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add Line
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      {computedLines.map(({ line, totals: lineTotals }, index) => (
                        <div key={line.id} className="rounded-lg border border-border bg-background p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-foreground">Line {index + 1}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setLines((current) =>
                                  current.length === 1 ? current : current.filter((entry) => entry.id !== line.id)
                                )
                              }
                              disabled={submitting || lines.length === 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Remove line ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="mt-3 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                            <div className="relative">
                              <label className="mb-2 block text-sm font-medium text-foreground" htmlFor={`product-search-${line.id}`}>
                                Search Product
                              </label>
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <input
                                  id={`product-search-${line.id}`}
                                  value={line.product_search}
                                  onChange={(event) => handleProductSearch(line.id, event.target.value)}
                                  disabled={submitting}
                                  className={`${FIELD_CLASS} pl-9`}
                                  placeholder="Name, code, SKU, category"
                                />
                              </div>
                              {line.product_search.trim().length >= 2 && !line.selected_product ? (
                                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                                  {line.product_loading ? (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">Searching products...</div>
                                  ) : line.product_error ? (
                                    <div className="px-3 py-2 text-sm text-destructive">{line.product_error}</div>
                                  ) : line.product_results.length ? (
                                    line.product_results.map((product) => (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onClick={() => selectProduct(line.id, product)}
                                        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        <span className="block font-medium">
                                          {product.product_code || product.sku || `P-${product.id}`} - {product.name}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                          Base {accountingMoney(product.base_price)} | Stock {product.current_stock_qty || product.inventory_status.available}
                                        </span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">No matching product.</div>
                                  )}
                                </div>
                              ) : null}
                              {line.selected_product ? (
                                <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                  {line.selected_product.product_code || line.selected_product.sku || `P-${line.selected_product.id}`} | Base {accountingMoney(line.selected_product.base_price)} | Stock {line.selected_product.current_stock_qty || line.selected_product.inventory_status.available} | Inventory {line.selected_product.inventory_ready ? "ready" : "not ready"}
                                </div>
                              ) : null}
                            </div>

                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Description</span>
                              <input
                                value={line.description}
                                onChange={(event) => updateLine(line.id, { description: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Quantity</span>
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={line.quantity}
                                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Unit Price</span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={line.unit_price}
                                onChange={(event) => updateLine(line.id, { unit_price: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">Line Discount</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.discount_amount}
                                onChange={(event) => updateLine(line.id, { discount_amount: event.target.value })}
                                disabled={submitting}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span className="font-medium text-foreground">GST Rate</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.gst_rate}
                                onChange={(event) => updateLine(line.id, { gst_rate: event.target.value })}
                                disabled={submitting || form.tax_mode !== "GST"}
                                className={FIELD_CLASS}
                              />
                            </label>
                            <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                              <span>Gross {accountingMoney(lineTotals.gross)}</span>
                              <span>Taxable {accountingMoney(lineTotals.taxable)}</span>
                              <span>Tax {accountingMoney(lineTotals.tax)}</span>
                              <span className="font-semibold text-foreground">Total {accountingMoney(lineTotals.lineTotal)}</span>
                            </div>
                          </div>

                          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-3">
                            <label className="flex items-center gap-3 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={line.create_requirement}
                                onChange={(event) => updateLine(line.id, { create_requirement: event.target.checked })}
                                disabled={submitting}
                              />
                              Create purchase/stock requirement
                            </label>
                            {line.create_requirement ? (
                              <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                                <label className="grid gap-2 text-sm">
                                  <span className="font-medium text-foreground">Required Qty</span>
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={line.requirement_quantity}
                                    onChange={(event) => updateLine(line.id, { requirement_quantity: event.target.value })}
                                    disabled={submitting}
                                    className={FIELD_CLASS}
                                  />
                                </label>
                                <label className="grid gap-2 text-sm">
                                  <span className="font-medium text-foreground">Requirement Note</span>
                                  <input
                                    value={line.requirement_note}
                                    onChange={(event) => updateLine(line.id, { requirement_note: event.target.value })}
                                    disabled={submitting}
                                    className={FIELD_CLASS}
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="space-y-4">
                  <section className="sticky top-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground">Totals</h3>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span>Subtotal</span><strong>{accountingMoney(totals.subtotal)}</strong></div>
                      <div className="flex justify-between"><span>Discount</span><strong>{accountingMoney(totals.discount)}</strong></div>
                      <div className="flex justify-between"><span>Taxable</span><strong>{accountingMoney(totals.taxable)}</strong></div>
                      <div className="flex justify-between"><span>Tax</span><strong>{accountingMoney(totals.tax)}</strong></div>
                      <div className="flex justify-between border-t border-border pt-2 text-base"><span>Grand Total</span><strong>{accountingMoney(totals.grand)}</strong></div>
                    </div>
                    <label className="mt-4 grid gap-2 text-sm">
                      <span className="font-medium text-foreground">Received Total</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.received_total}
                        onChange={(event) => setForm((current) => ({ ...current, received_total: event.target.value }))}
                        disabled={submitting}
                        className={FIELD_CLASS}
                      />
                    </label>
                    <div className="mt-3 flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                      <span>Balance</span>
                      <strong>{accountingMoney(totals.balance)}</strong>
                    </div>
                    {validationErrors.length ? (
                      <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {validationErrors.map((entry) => (
                          <p key={entry}>{entry}</p>
                        ))}
                      </div>
                    ) : null}
                    {error && drawerOpen ? (
                      <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    ) : null}
                  </section>
                </aside>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create Direct Sale"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PortalPage>
  );
}
