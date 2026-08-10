// @ts-nocheck
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  getPurchasePipelineSummary,
  type PurchasePipelineSummary,
} from "@/services/inventory";

type StageCard = {
  key: string;
  step: string;
  label: string;
  href: string;
  primary: { value: string | number; caption: string };
  attention?: { value: number; caption: string } | null;
};

function StagePipeline({ summary }: { summary: PurchasePipelineSummary }) {
  const stages: StageCard[] = [
    {
      key: "requests",
      step: "1",
      label: "Purchase Requests",
      href: ROUTES.admin.purchaseRequests,
      primary: { value: summary.purchase_requests.total, caption: "total raised" },
      attention: summary.purchase_requests.open
        ? { value: summary.purchase_requests.open, caption: "open / to order" }
        : null,
    },
    {
      key: "orders",
      step: "2",
      label: "Purchase Orders",
      href: ROUTES.admin.purchaseOrders,
      primary: { value: formatRupee(summary.purchase_orders.open_value), caption: "open PO value" },
      attention: summary.purchase_orders.awaiting_receipt
        ? { value: summary.purchase_orders.awaiting_receipt, caption: "awaiting goods" }
        : null,
    },
    {
      key: "receipts",
      step: "3",
      label: "Goods Receipts",
      href: ROUTES.admin.purchaseReceipts,
      primary: { value: summary.goods_receipts.received, caption: "received (GRN)" },
      attention: summary.goods_receipts.unbilled
        ? { value: summary.goods_receipts.unbilled, caption: "not yet billed" }
        : null,
    },
    {
      key: "bills",
      step: "4",
      label: "Purchase Bills",
      href: ROUTES.admin.purchaseBills,
      primary: { value: formatRupee(summary.vendor_bills.posted_value), caption: "posted bill value" },
      attention: summary.vendor_bills.draft
        ? { value: summary.vendor_bills.draft, caption: "draft to post" }
        : null,
    },
    {
      key: "payments",
      step: "5",
      label: "Vendor Payments",
      href: ROUTES.admin.purchaseVendorPayments,
      primary: { value: formatRupee(summary.vendor_payments.paid_value), caption: "paid to vendors" },
      attention: null,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stages.map((stage) => (
        <Link
          key={stage.key}
          href={stage.href}
          className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {stage.step}
            </span>
            <span className="text-sm font-semibold text-foreground">{stage.label}</span>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums text-foreground">{stage.primary.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{stage.primary.caption}</div>
          </div>
          {stage.attention ? (
            <span className="mt-auto inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {stage.attention.value} {stage.attention.caption}
            </span>
          ) : (
            <span className="mt-auto text-[11px] text-muted-foreground">On track</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export default function AdminPurchasesPage() {
  const [summary, setSummary] = useState<PurchasePipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPurchasePipelineSummary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load purchase pipeline.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const outstanding = summary?.vendor_payments.outstanding_payable ?? "0.00";
  const unbilled = summary?.goods_receipts.unbilled ?? 0;
  const awaiting = summary?.purchase_orders.awaiting_receipt ?? 0;

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Purchases — Procure-to-Pay Command Center"
      subtitle="Live procurement pipeline from request to order to goods receipt to bill to payment. Each step is a separate auditable record — no step auto-creates the next."
      helperNote="Bottleneck metrics highlight where the chain is waiting: purchase orders awaiting goods, goods receipts not yet billed, and posted bills not yet paid. Accounting bridge status and reconciliation evidence are confirmed in Accounting & Reconciliation."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases" },
      ]}
      statusBadge={{ label: "Purchase Source Workflow", tone: "info" }}
      actions={[
        { href: ROUTES.admin.purchaseRequests, label: "Purchase Requests", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase Orders", variant: "primary" },
        { href: ROUTES.admin.purchaseReceipts, label: "Goods Receipts", variant: "secondary" },
        { href: ROUTES.admin.purchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorPayables, label: "Vendor Payables", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorPayments, label: "Vendor Payments", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorReturns, label: "Vendor Returns", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendors", variant: "secondary" },
      ]}
      stats={[
        { label: "Outstanding Payable", value: loading ? "—" : formatRupee(outstanding), tone: (!loading && Number(outstanding) > 0 ? "warning" : "success") as "warning" | "success" },
        { label: "Unbilled Receipts", value: loading ? "—" : unbilled, tone: (!loading && unbilled > 0 ? "warning" : "success") as "warning" | "success" },
        { label: "POs Awaiting Goods", value: loading ? "—" : awaiting, tone: (!loading && awaiting > 0 ? "info" : "default") as "info" | "default" },
        { label: "Draft Bills", value: loading ? "—" : (summary?.vendor_bills.draft ?? 0), tone: (!loading && (summary?.vendor_bills.draft ?? 0) > 0 ? "warning" : "default") as "warning" | "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading purchase pipeline..." /> : null}
      {!loading && error ? <ERPErrorState title="Purchase pipeline load failed" description={error} /> : null}

      {!loading && !error && summary ? (
        <div className="space-y-6">
          <ERPSectionShell
            title="Procure-to-pay pipeline"
            description="Each card is a live stage of the chain. Amber badges flag the operational bottleneck at that stage — open the stage to act on it."
          >
            <StagePipeline summary={summary} />

            {/* Bottleneck alert strip */}
            {unbilled > 0 || Number(outstanding) > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>
                  {unbilled > 0 ? (
                    <>
                      <strong>{unbilled}</strong> goods receipt{unbilled === 1 ? "" : "s"} received but not yet billed
                      {Number(outstanding) > 0 ? " · " : ""}
                    </>
                  ) : null}
                  {Number(outstanding) > 0 ? (
                    <>
                      <strong>{formatRupee(outstanding)}</strong> outstanding vendor payable on posted bills
                    </>
                  ) : null}
                </span>
                <Link
                  href={unbilled > 0 ? ROUTES.admin.purchaseReceipts : ROUTES.admin.purchaseVendorPayables}
                  className="ml-auto shrink-0 rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold hover:bg-amber-100"
                >
                  {unbilled > 0 ? "Bill received goods" : "Review payables"}
                </Link>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="text-lg">✓</span>
                No procurement bottlenecks — all received goods are billed and posted bills are settled.
              </div>
            )}
          </ERPSectionShell>

          <ERPSectionShell
            title="Purchase order status"
            description="Where authorised purchase orders sit in the receive-and-bill cycle."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Draft", value: summary.purchase_orders.draft },
                { label: "Sent", value: summary.purchase_orders.sent },
                { label: "Partially Received", value: summary.purchase_orders.partially_received },
                { label: "Received", value: summary.purchase_orders.received },
                { label: "Billed", value: summary.purchase_orders.billed },
                { label: "Total", value: summary.purchase_orders.total },
              ].map((cell) => (
                <div key={cell.label} className="rounded-xl border border-border bg-muted/20 px-3 py-3">
                  <div className="text-2xl font-bold tabular-nums text-foreground">{cell.value}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{cell.label}</div>
                </div>
              ))}
            </div>
          </ERPSectionShell>

          <ERPSectionShell
            title="Accounting bridge status"
            description="Accounting bridge posting and reconciliation evidence are confirmed in Accounting & Reconciliation. This page does not auto-post accounting entries."
          >
            <div className="rounded-[1.2rem] border border-border bg-card p-4 text-sm text-muted-foreground">
              Purchase bills and vendor payments feed the accounting bridge as inputs. Confirm bridge status and reconciliation evidence at{" "}
              <Link href={ROUTES.admin.accountingBridgeReconciliation} className="font-medium text-primary underline-offset-4 hover:underline">
                Accounting &gt; Bridge Reconciliation
              </Link>
              .
            </div>
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
