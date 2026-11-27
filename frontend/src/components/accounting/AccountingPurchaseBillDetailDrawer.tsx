"use client";

import Link from "next/link";
import { FileText, Package, Printer, X } from "lucide-react";

import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import { buildAdminPurchaseBillPrintRoute } from "@/lib/route-builders";
import type { AccountingPurchaseBill } from "@/services/accounting";

type AccountingPurchaseBillDetailDrawerProps = {
  bill: AccountingPurchaseBill;
  onClose: () => void;
};

function statusTone(status: AccountingPurchaseBill["status"]) {
  switch (status) {
    case "POSTED":
      return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "APPROVED":
      return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    case "CANCELLED":
      return "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
    case "DRAFT":
    default:
      return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
  }
}

export function summarizePurchaseBillItems(bill: AccountingPurchaseBill): {
  lineCount: number;
  totalQty: number;
  previewText: string;
} {
  const lines = bill.lines ?? [];
  const lineCount = lines.length;
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const names = lines
    .map((line) => line.inventory_item_product_name || line.description || line.inventory_item_sku)
    .filter((name): name is string => Boolean(name && name.trim()));
  const previewText =
    names.length === 0
      ? "No line items"
      : names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  return { lineCount, totalQty, previewText };
}

export default function AccountingPurchaseBillDetailDrawer({
  bill,
  onClose,
}: AccountingPurchaseBillDetailDrawerProps) {
  const lines = bill.lines ?? [];
  const { lineCount, totalQty } = summarizePurchaseBillItems(bill);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col border-l border-border bg-card text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Purchase Bill {bill.bill_no}
              </h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${statusTone(bill.status)}`}
              >
                {bill.status}
              </span>
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {bill.tax_mode}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Vendor: <span className="font-semibold text-foreground">{bill.vendor_name || `Vendor #${bill.vendor}`}</span>
              {" · "}
              Date: <span className="font-medium text-foreground">{accountingDate(bill.bill_date)}</span>
              {" · "}
              {lineCount} item{lineCount === 1 ? "" : "s"} ({totalQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} total qty)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bill detail"
            className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs sm:grid-cols-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</span>
              <p className="mt-0.5 font-semibold text-foreground">{bill.vendor_name || `#${bill.vendor}`}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Branch</span>
              <p className="mt-0.5 font-medium text-foreground">{bill.branch_code || bill.branch_name || "Primary default"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inward Location</span>
              <p className="mt-0.5 font-medium text-foreground">{bill.stock_location_name || "Item default"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Journal Entry</span>
              <p className="mt-0.5 font-mono font-medium text-foreground">{bill.posted_journal_entry_no || "Not posted yet"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment / Credit Account</span>
              <p className="mt-0.5 font-medium text-foreground">{bill.finance_account_name || "Accounts Payable (Credit)"}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Settlement Posture</span>
              <p className="mt-0.5 font-medium text-foreground">
                Settled: {accountingMoney(bill.posted_settled_amount || "0.00")}
                {" · "}
                Due: <span className={Number(bill.outstanding_amount || 0) > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
                  {accountingMoney(bill.outstanding_amount ?? bill.grand_total)}
                </span>
              </p>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Purchased Items ({lineCount})
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Total Quantity: <strong className="text-foreground">{totalQty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</strong>
              </span>
            </div>

            {lines.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No line items recorded on this purchase bill.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-border bg-muted/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Item &amp; SKU</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right">Taxable</th>
                      <th className="px-3 py-2.5 text-right">Tax</th>
                      <th className="px-3 py-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((line, index) => (
                      <tr key={line.id ?? index} className="hover:bg-muted/30">
                        <td className="px-3 py-2.5 text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground">
                            {line.inventory_item_product_name || `Item #${line.inventory_item}`}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {line.inventory_item_sku ? (
                              <span className="font-mono">{line.inventory_item_sku}</span>
                            ) : null}
                            {line.inventory_item_stock_item_type ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                {line.inventory_item_stock_item_type.replace(/_/g, " ")}
                              </span>
                            ) : null}
                          </div>
                          {line.description ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">{line.description}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                          {Number(line.quantity || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            {line.inventory_item_unit_of_measure || "PCS"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {accountingMoney(line.unit_cost)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {accountingMoney(line.taxable_value ?? String(Number(line.quantity || 0) * Number(line.unit_cost || 0)))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {accountingMoney(line.tax_amount || "0.00")}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                          {accountingMoney(
                            line.line_total ??
                              String(
                                Number(line.quantity || 0) * Number(line.unit_cost || 0) +
                                  Number(line.tax_amount || 0),
                              ),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {bill.notes ? (
              <div className="flex-1 rounded-xl border border-border bg-muted/20 p-3 text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{bill.notes}</p>
              </div>
            ) : (
              <div />
            )}

            <div className="w-full max-w-xs space-y-1.5 rounded-xl border border-border bg-muted/30 p-4 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium text-foreground">{accountingMoney(bill.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Tax Total</span>
                <span className="tabular-nums font-medium text-foreground">{accountingMoney(bill.tax_total)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
                <span>Grand Total</span>
                <span className="tabular-nums text-primary">{accountingMoney(bill.grand_total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <Link
            href={buildAdminPurchaseBillPrintRoute(bill.id, "accounting")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF / Print Full Bill
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-border bg-background px-4 text-xs font-medium text-foreground transition hover:bg-muted cursor-pointer"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
