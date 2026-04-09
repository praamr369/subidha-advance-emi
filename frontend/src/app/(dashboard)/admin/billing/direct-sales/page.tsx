"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { listCustomers, type CustomerRecord } from "@/services/customers";
import { listInventoryItems, type InventoryItem } from "@/services/inventory";
import { listProducts, type ProductRecord } from "@/services/products";
import {
  confirmDirectSale,
  createDirectSale,
  listDirectSales,
  markDirectSaleDelivered,
  type DirectSale,
  type DirectSaleLine,
} from "@/services/billing";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingInvoicesRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";

type DraftLine = {
  product: string;
  inventory_item: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  gst_rate: string;
  hsn_sac_code: string;
};

const DEFAULT_LINE: DraftLine = {
  product: "",
  inventory_item: "",
  description: "",
  quantity: "1.000",
  unit_price: "0.00",
  discount_amount: "0.00",
  gst_rate: "0.00",
  hsn_sac_code: "",
};

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number): string {
  return value.toFixed(3);
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function buildLinePayload(line: DraftLine, taxMode: "GST" | "NON_GST"): DirectSaleLine {
  const quantity = Math.max(toNumber(line.quantity), 0);
  const unitPrice = Math.max(toNumber(line.unit_price), 0);
  const discountAmount = Math.max(toNumber(line.discount_amount), 0);
  const taxableValue = Math.max(quantity * unitPrice - discountAmount, 0);
  const gstRate = taxMode === "GST" ? Math.max(toNumber(line.gst_rate), 0) : 0;
  const taxAmount = taxableValue * (gstRate / 100);
  const cgstAmount = taxMode === "GST" ? taxAmount / 2 : 0;
  const sgstAmount = taxMode === "GST" ? taxAmount / 2 : 0;
  const igstAmount = 0;
  const lineTotal = taxableValue + cgstAmount + sgstAmount + igstAmount;

  return {
    product: Number(line.product),
    inventory_item: line.inventory_item ? Number(line.inventory_item) : null,
    description: line.description.trim(),
    quantity: formatQuantity(quantity),
    unit_price: formatMoney(unitPrice),
    discount_amount: formatMoney(discountAmount),
    taxable_value: formatMoney(taxableValue),
    gst_rate: taxMode === "GST" ? formatMoney(gstRate) : null,
    cgst_amount: formatMoney(cgstAmount),
    sgst_amount: formatMoney(sgstAmount),
    igst_amount: formatMoney(igstAmount),
    line_total: formatMoney(lineTotal),
    hsn_sac_code: line.hsn_sac_code.trim(),
  };
}

export default function BillingDirectSalesPage() {
  const [rows, setRows] = useState<DirectSale[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    sale_date: new Date().toISOString().slice(0, 10),
    customer: "",
    tax_mode: "NON_GST" as "GST" | "NON_GST",
    finance_account: "",
    delivery_required: false,
    delivery_reference: "",
    customer_name_snapshot: "",
    customer_phone_snapshot: "",
    customer_gstin: "",
    received_total: "0.00",
    notes: "",
    lines: [DEFAULT_LINE],
  });

  async function loadPage() {
    try {
      const [
        directSalesPayload,
        customerPayload,
        productPayload,
        inventoryPayload,
        financePayload,
      ] = await Promise.all([
        listDirectSales(),
        listCustomers(),
        listProducts(),
        listInventoryItems(),
        listFinanceAccounts(),
      ]);
      setRows(directSalesPayload.results);
      setCustomers(customerPayload.results);
      setProducts(productPayload);
      setInventoryItems(inventoryPayload.results);
      setFinanceAccounts(financePayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load direct retail sales."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [String(customer.id), customer])),
    [customers]
  );
  const inventoryByProduct = useMemo(() => {
    const next = new Map<string, InventoryItem>();
    for (const item of inventoryItems) {
      next.set(String(item.product), item);
    }
    return next;
  }, [inventoryItems]);

  const computedLines = useMemo(
    () =>
      form.lines
        .filter((line) => line.product)
        .map((line) => {
          const product = products.find((entry) => String(entry.id) === line.product);
          const payload = buildLinePayload(line, form.tax_mode);
          return {
            payload,
            productName: product?.name || payload.description || `Product ${payload.product}`,
          };
        }),
    [form.lines, form.tax_mode, products]
  );

  const computedTotals = useMemo(() => {
    return computedLines.reduce(
      (accumulator, entry) => {
        accumulator.subtotal += toNumber(entry.payload.unit_price) * toNumber(entry.payload.quantity);
        accumulator.discount_total += toNumber(entry.payload.discount_amount);
        accumulator.taxable_total += toNumber(entry.payload.taxable_value);
        accumulator.tax_total +=
          toNumber(entry.payload.cgst_amount) +
          toNumber(entry.payload.sgst_amount) +
          toNumber(entry.payload.igst_amount);
        accumulator.grand_total += toNumber(entry.payload.line_total);
        return accumulator;
      },
      {
        subtotal: 0,
        discount_total: 0,
        taxable_total: 0,
        tax_total: 0,
        grand_total: 0,
      }
    );
  }, [computedLines]);

  const receivedTotal = Math.min(
    computedTotals.grand_total,
    Math.max(toNumber(form.received_total), 0)
  );

  const columns: EnterpriseColumnDef<DirectSale>[] = [
    { key: "sale_date", header: "Date", render: (row) => accountingDate(row.sale_date) },
    { key: "sale_no", header: "Direct Sale" },
    { key: "customer_name_snapshot", header: "Customer" },
    {
      key: "delivery_required",
      header: "Delivery",
      render: (row) =>
        row.delivery_required
          ? row.delivered_at
            ? `Delivered ${accountingDate(row.delivered_at)}`
            : "Delivery required"
          : "Counter / carry-out",
    },
    {
      key: "billing_invoice_status",
      header: "Billing",
      render: (row) => row.billing_invoice_status || "Draft mirror",
    },
    {
      key: "grand_total",
      header: "Grand Total",
      render: (row) => accountingMoney(row.grand_total),
    },
    { key: "status", header: "Status" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Confirm"
              title={`Confirm ${row.sale_no || `direct sale ${row.id}`}?`}
              description="Confirmation freezes the operational direct sale before final billing posting."
              onConfirm={async () => {
                await confirmDirectSale(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.delivery_required && !row.delivered_at && row.status !== "INVOICED" ? (
            <ConfirmActionButton
              label="Mark Delivered"
              title={`Mark ${row.sale_no || `direct sale ${row.id}`} delivered?`}
              description="This unlocks final invoice posting for delivery-gated direct sales."
              onConfirm={async () => {
                await markDirectSaleDelivered(row.id, row.delivery_reference || "");
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.billing_invoice_id ? (
            <Link
              href={buildAdminBillingDocumentRoute(row.billing_invoice_id)}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Billing Detail
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  async function handleCreateDirectSale() {
    if (computedLines.length === 0) {
      setError("At least one direct-sale line is required.");
      return;
    }

    const selectedCustomer = form.customer ? customerMap.get(form.customer) : undefined;
    const payload = {
      sale_date: form.sale_date,
      customer: form.customer ? Number(form.customer) : null,
      tax_mode: form.tax_mode,
      finance_account: form.finance_account ? Number(form.finance_account) : null,
      delivery_required: form.delivery_required,
      delivery_reference: form.delivery_reference.trim(),
      subtotal: formatMoney(computedTotals.subtotal),
      discount_total: formatMoney(computedTotals.discount_total),
      taxable_total: formatMoney(computedTotals.taxable_total),
      tax_total: formatMoney(computedTotals.tax_total),
      grand_total: formatMoney(computedTotals.grand_total),
      received_total: formatMoney(receivedTotal),
      balance_total: formatMoney(computedTotals.grand_total - receivedTotal),
      customer_name_snapshot:
        form.customer_name_snapshot.trim() || selectedCustomer?.name || "",
      customer_phone_snapshot:
        form.customer_phone_snapshot.trim() || selectedCustomer?.phone || "",
      customer_gstin: form.customer_gstin.trim() || null,
      notes: form.notes.trim(),
      lines: computedLines.map((entry) => entry.payload),
    };

    try {
      setSubmitting(true);
      await createDirectSale(payload);
      setNotice("Direct sale created with a linked billing invoice draft.");
      setForm({
        sale_date: new Date().toISOString().slice(0, 10),
        customer: "",
        tax_mode: "NON_GST",
        finance_account: "",
        delivery_required: false,
        delivery_reference: "",
        customer_name_snapshot: "",
        customer_phone_snapshot: "",
        customer_gstin: "",
        received_total: "0.00",
        notes: "",
        lines: [DEFAULT_LINE],
      });
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create the direct sale."));
    } finally {
      setSubmitting(false);
    }
  }

  const draftCount = rows.filter((row) => row.status === "DRAFT").length;
  const deliveryHoldCount = rows.filter(
    (row) => row.delivery_required && !row.delivered_at && row.status !== "INVOICED"
  ).length;
  const invoicedCount = rows.filter((row) => row.status === "INVOICED").length;

  return (
    <PortalPage
      title="Direct Sales Register"
      subtitle="Run non-EMI retail sales through a separate operational source record, then let billing and inventory post explicitly from the linked document flow."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Direct Sales" },
      ]}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoice Register", variant: "secondary" },
        { href: buildAdminBillingInvoicesRoute({ source_type: "DIRECT_SALE" }), label: "Retail Invoices", variant: "secondary" },
      ]}
      stats={[
        { label: "Direct Sales", value: String(rows.length), tone: "info" },
        { label: "Draft", value: String(draftCount), tone: draftCount > 0 ? "warning" : "default" },
        { label: "Delivery Hold", value: String(deliveryHoldCount), tone: deliveryHoldCount > 0 ? "warning" : "success" },
        { label: "Invoiced", value: String(invoicedCount), tone: invoicedCount > 0 ? "success" : "default" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading direct-sale operations..." /> : null}
      {!loading && error ? <ErrorState title="Direct sales load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          {notice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Draft Sales"
              value={String(draftCount)}
              subtext="Operational orders still waiting for direct-sale confirmation."
              tone={draftCount > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Delivery Hold"
              value={String(deliveryHoldCount)}
              subtext="Delivery-required sales that still block final invoice posting."
              tone={deliveryHoldCount > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Retail Billing"
              value={String(rows.filter((row) => row.billing_invoice_id).length)}
              subtext="Direct sales with a mirrored billing invoice draft or posted document."
              tone="info"
            />
            <StatCard
              label="Grand Total Draft"
              value={accountingMoney(computedTotals.grand_total)}
              subtext="Current draft document total from the form below."
              tone="info"
            />
          </div>

          <WorkspaceSection
            title="Create Direct Sale"
            description="This creates the operational direct-sale source record and a linked retail billing invoice draft. Inventory does not move until the invoice is posted."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2 text-sm">
                <span>Sale date</span>
                <input
                  type="date"
                  value={form.sale_date}
                  onChange={(event) => setForm((current) => ({ ...current, sale_date: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span>Customer</span>
                <select
                  value={form.customer}
                  onChange={(event) => {
                    const nextCustomer = customerMap.get(event.target.value);
                    setForm((current) => ({
                      ...current,
                      customer: event.target.value,
                      customer_name_snapshot: nextCustomer?.name || current.customer_name_snapshot,
                      customer_phone_snapshot: nextCustomer?.phone || current.customer_phone_snapshot,
                    }));
                  }}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                >
                  <option value="">Walk-in / manual</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span>Tax mode</span>
                <select
                  value={form.tax_mode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tax_mode: event.target.value as "GST" | "NON_GST",
                    }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                >
                  <option value="NON_GST">NON_GST</option>
                  <option value="GST">GST</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span>Finance account</span>
                <select
                  value={form.finance_account}
                  onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                >
                  <option value="">Select account</option>
                  {financeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.kind}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span>Customer name snapshot</span>
                <input
                  type="text"
                  value={form.customer_name_snapshot}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer_name_snapshot: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span>Customer phone snapshot</span>
                <input
                  type="text"
                  value={form.customer_phone_snapshot}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customer_phone_snapshot: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span>Customer GSTIN</span>
                <input
                  type="text"
                  value={form.customer_gstin}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customer_gstin: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span>Received amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.received_total}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, received_total: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.delivery_required}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      delivery_required: event.target.checked,
                    }))
                  }
                />
                Delivery required before final invoice posting
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Delivery reference</span>
                <input
                  type="text"
                  value={form.delivery_reference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, delivery_reference: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={3}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-5 space-y-4">
              {form.lines.map((line, index) => {
                return (
                  <div key={`line-${index}`} className="rounded-2xl border border-border bg-background p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-sm">
                        <span>Product</span>
                        <select
                          value={line.product}
                          onChange={(event) => {
                            const nextProduct = products.find(
                              (entry) => String(entry.id) === event.target.value
                            );
                            const inventoryItem = inventoryByProduct.get(event.target.value);
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = {
                                ...nextLines[index],
                                product: event.target.value,
                                inventory_item: inventoryItem ? String(inventoryItem.id) : "",
                                description: nextProduct?.name || nextLines[index].description,
                              };
                              return { ...current, lines: nextLines };
                            });
                          }}
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        >
                          <option value="">Select product</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.product_code || `P-${product.id}`} · {product.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>Inventory profile</span>
                        <select
                          value={line.inventory_item}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = {
                                ...nextLines[index],
                                inventory_item: event.target.value,
                              };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        >
                          <option value="">Optional</option>
                          {inventoryItems
                            .filter((item) => !line.product || String(item.product) === line.product)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.product_code || item.product_name} · {item.sku || item.unit_of_measure}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>Description</span>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = {
                                ...nextLines[index],
                                description: event.target.value,
                              };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>HSN / SAC</span>
                        <input
                          type="text"
                          value={line.hsn_sac_code}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = {
                                ...nextLines[index],
                                hsn_sac_code: event.target.value,
                              };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>Quantity</span>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = { ...nextLines[index], quantity: event.target.value };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>Unit price</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = { ...nextLines[index], unit_price: event.target.value };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>Discount</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discount_amount}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = {
                                ...nextLines[index],
                                discount_amount: event.target.value,
                              };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>GST rate</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.gst_rate}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextLines = [...current.lines];
                              nextLines[index] = { ...nextLines[index], gst_rate: event.target.value };
                              return { ...current, lines: nextLines };
                            })
                          }
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      lines: [...current.lines, DEFAULT_LINE],
                    }))
                  }
                  className="rounded-xl border border-border px-4 py-2 text-sm"
                >
                  Add line
                </button>
                {form.lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        lines: current.lines.slice(0, -1),
                      }))
                    }
                    className="rounded-xl border border-border px-4 py-2 text-sm"
                  >
                    Remove last line
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleCreateDirectSale()}
                  disabled={submitting}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create direct sale"}
                </button>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Direct Sale Register"
            description="Operational retail sales stay separate from EMI subscriptions while keeping a direct link into the billing document engine."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No direct sales yet"
                description="Create the first direct retail sale to open the billing and inventory-ready workflow."
              />
            ) : (
              <EnterpriseDataTable data={rows} columns={columns} />
            )}
          </WorkspaceSection>
        </>
      ) : null}
    </PortalPage>
  );
}
