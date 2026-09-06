"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Banknote,
  FileText,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Undo2,
  User,
  Wallet,
} from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import { WorkbenchFilterChips } from "@/components/workbench/WorkbenchFilterChips";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  getAdminCustomerReversalContext,
  listAdminReversals,
  type CustomerReversalContext,
  type ReversalRow,
} from "@/services/reversals";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong.";
}

function StatusChip({ value }: { value: string }) {
  const v = (value || "").toUpperCase();
  const cls =
    v === "ACTIVE" || v === "POSTED" || v === "DELIVERED" || v === "INVOICED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : v.includes("CANCEL") || v === "VOID" || v === "RETURNED" || v === "REVERSED_POST_INVOICE"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : v === "DRAFT" || v === "PENDING" || v === "CONFIRMED"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {value || "—"}
    </span>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm transition hover:bg-muted"
    >
      {label}
    </Link>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count !== undefined ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Customer-centric reversal browser: load a customer and see every reversible
 * artifact (direct sales, receipts, subscriptions, reversal history) with links
 * into the right reversal/return flow. Extracted from
 * /admin/billing/reversal-workbench so the same workflow renders both on that
 * route and as a tab in the unified Reversal Center (/admin/billing/reversals).
 */
export default function CustomerReversalWorkbenchPanel() {
  const searchParams = useSearchParams();

  const [customerInput, setCustomerInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<CustomerReversalContext | null>(null);
  const [history, setHistory] = useState<ReversalRow[]>([]);
  // Segment filter: focus on a single reversible-artifact type.
  const [segment, setSegment] = useState<"all" | "sales" | "receipts" | "subs" | "history">("all");

  const loadCustomer = useCallback(async (id: string) => {
    if (!id.trim() || Number(id) <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const [ctx, reversals] = await Promise.all([
        getAdminCustomerReversalContext(id.trim()),
        listAdminReversals({ customer: id.trim() }),
      ]);
      setContext(ctx);
      setHistory(reversals.results);
    } catch (err) {
      setContext(null);
      setHistory([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = searchParams?.get("customer") || "";
    if (fromUrl && Number(fromUrl) > 0) {
      setCustomerInput(fromUrl);
      void loadCustomer(fromUrl);
    }
  }, [searchParams, loadCustomer]);

  const c = context?.customer;
  const activeReceipts = (context?.receipts || []).filter((r) => r.status !== "VOID");
  const sdReturnsBase = c
    ? `${ROUTES.admin.serviceDeskReturns}?customer=${c.id}&customer_name=${encodeURIComponent(c.name)}&customer_phone=${encodeURIComponent(c.phone)}`
    : ROUTES.admin.serviceDeskReturns;

  return (
    <div className="space-y-6">
      {/* ── Customer lookup ─────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label htmlFor="f-customer-id" className="mb-1 block text-xs font-medium text-muted-foreground">Customer ID</label>
            <input id="f-customer-id"
              value={customerInput}
              onChange={(e) => setCustomerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadCustomer(customerInput);
              }}
              placeholder="e.g. 12"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadCustomer(customerInput)}
            disabled={loading || !customerInput.trim() || Number(customerInput) <= 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Loading..." : "Load Customer"}
          </button>
          <Link
            href={ROUTES.admin.customers}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <User className="h-4 w-4" />
            Find in Customer List
          </Link>
        </div>

        {error ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {c ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-sky-600" />
              <span className="font-semibold text-sky-900">{c.name}</span>
              <span className="text-sky-700">{c.phone}</span>
            </div>
            <StatusChip value={`KYC ${c.kyc_status}`} />
            <div className="flex items-center gap-1.5 text-sky-800">
              <Wallet className="h-4 w-4" />
              Credit balance: <span className="font-semibold">{formatRupee(c.credit_balance)}</span>
            </div>
            <div className="ml-auto flex gap-2">
              <ActionLink href={`/admin/customers/${c.id}`} label="Profile" />
              <ActionLink href={`${ROUTES.admin.billingReversals}?customer=${c.id}`} label="Create Refund" />
            </div>
          </div>
        ) : null}
      </section>

      {!context && !loading && !error ? (
        <ERPEmptyState
          title="Load a customer to begin"
          description="Enter a customer ID (or arrive from the customer list) to see every direct sale, receipt, and subscription that can be reversed or returned."
        />
      ) : null}

      {context ? (
        <>
          <WorkbenchFilterChips
            chips={[
              { key: "all", label: "All" },
              { key: "sales", label: "Direct Sales", count: context.direct_sales.length },
              { key: "receipts", label: "Receipts", count: context.receipts.length },
              { key: "subs", label: "Subscriptions", count: context.subscriptions.length },
              { key: "history", label: "Reversal Records", count: history.length },
            ]}
            active={segment}
            onSelect={(key) => setSegment(key as typeof segment)}
          />

          {/* ── Direct Sales ───────────────────────────────────── */}
          {segment === "all" || segment === "sales" ? (
          <Section icon={FileText} title="Direct Sales" count={context.direct_sales.length}>
            {context.direct_sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No direct sales for this customer.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Sale</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {context.direct_sales.map((sale) => (
                      <tr key={sale.id} className="border-t border-border">
                        <td className="px-2 py-2 font-medium text-foreground">{sale.sale_no || `#${sale.id}`}</td>
                        <td className="px-2 py-2 text-muted-foreground">{sale.sale_date || "—"}</td>
                        <td className="px-2 py-2"><StatusChip value={sale.status} /></td>
                        <td className="px-2 py-2 text-right">{formatRupee(sale.grand_total)}</td>
                        <td className={`px-2 py-2 text-right ${Number(sale.balance_total) > 0 ? "font-medium text-amber-700" : "text-muted-foreground"}`}>
                          {formatRupee(sale.balance_total)}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{sale.billing_invoice_no || "—"}</td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1.5">
                            <ActionLink
                              href={`${ROUTES.admin.billingReversals}?direct_sale=${sale.id}`}
                              label="Return / Cancel / Exchange"
                            />
                            <ActionLink
                              href={`${sdReturnsBase}&lookup_type=direct_sale&lookup_id=${sale.id}`}
                              label="Return Case"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          ) : null}

          {/* ── Receipts ───────────────────────────────────────── */}
          {segment === "all" || segment === "receipts" ? (
          <Section icon={Receipt} title="Receipts" count={context.receipts.length}>
            {context.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receipts for this customer.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Receipt</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Linked Sale</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {context.receipts.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-border">
                        <td className="px-2 py-2 font-medium text-foreground">{receipt.receipt_no || `#${receipt.id}`}</td>
                        <td className="px-2 py-2 text-muted-foreground">{receipt.receipt_date || "—"}</td>
                        <td className="px-2 py-2"><StatusChip value={receipt.status} /></td>
                        <td className="px-2 py-2 text-right">{formatRupee(receipt.amount)}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {receipt.direct_sale_id ? `DS #${receipt.direct_sale_id}` : receipt.billing_invoice_id ? `Inv #${receipt.billing_invoice_id}` : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1.5">
                            {receipt.status !== "VOID" ? (
                              <ActionLink
                                href={`${ROUTES.admin.billingReversals}?receipt=${receipt.id}${receipt.direct_sale_id ? `&direct_sale=${receipt.direct_sale_id}` : ""}`}
                                label="Void Receipt"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">Voided</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          ) : null}

          {/* ── Subscriptions ──────────────────────────────────── */}
          {segment === "all" || segment === "subs" ? (
          <Section icon={Package} title="Subscriptions (EMI / Rent / Lease)" count={context.subscriptions.length}>
            {context.subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions for this customer.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Subscription</th>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">Plan</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Monthly</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {context.subscriptions.map((sub) => (
                      <tr key={sub.id} className="border-t border-border">
                        <td className="px-2 py-2 font-medium text-foreground">{sub.subscription_number || `#${sub.id}`}</td>
                        <td className="px-2 py-2 text-muted-foreground">{sub.product_name || "—"}</td>
                        <td className="px-2 py-2"><StatusChip value={sub.plan_type} /></td>
                        <td className="px-2 py-2"><StatusChip value={sub.status} /></td>
                        <td className="px-2 py-2 text-right">{formatRupee(sub.monthly_amount)}</td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1.5">
                            <ActionLink href={`/admin/subscriptions/${sub.id}/lifecycle`} label="Lifecycle / Inspection" />
                            <ActionLink
                              href={`${sdReturnsBase}&lookup_type=subscription&lookup_id=${sub.id}`}
                              label="Return Case"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          ) : null}

          {/* ── Reversal history ───────────────────────────────── */}
          {segment === "all" || segment === "history" ? (
          <Section icon={Undo2} title="Existing Reversal Records" count={history.length}>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reversal records yet for this customer.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Reference</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={`${row.type}-${row.id}`} className="border-t border-border">
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-1.5 text-foreground">
                            {row.type === "sale_return" ? <Undo2 className="h-3.5 w-3.5 text-muted-foreground" /> : row.type === "receipt_void" ? <Receipt className="h-3.5 w-3.5 text-muted-foreground" /> : row.type === "customer_refund" ? <Banknote className="h-3.5 w-3.5 text-muted-foreground" /> : <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            {row.type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-medium text-foreground">{row.reference_no || `#${row.id}`}</td>
                        <td className="px-2 py-2"><StatusChip value={row.status} /></td>
                        <td className="px-2 py-2 text-right">{formatRupee(row.amount)}</td>
                        <td className="px-2 py-2 text-muted-foreground">{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void loadCustomer(customerInput)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
