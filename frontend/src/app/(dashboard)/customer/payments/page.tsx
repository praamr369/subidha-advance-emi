"use client";

import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import { listCustomerPayments, type CustomerPayment } from "@/services/customer";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadReceiptHref(receiptId: number | string) {
  return `/api/v1/customer/receipts/${receiptId}/pdf/`;
}

function splitReceipts(receipts: FinanceReceiptRow[]) {
  const directSale = receipts.filter((r) => r.direct_sale_id != null);
  const rentLease = receipts.filter((r) => r.direct_sale_id == null && (r.plan_type === "RENT" || r.plan_type === "LEASE"));
  const emi = receipts.filter((r) => r.direct_sale_id == null && r.plan_type !== "RENT" && r.plan_type !== "LEASE");
  return { directSale, rentLease, emi };
}

const VIEW_TABS = [
  { value: "payments", label: "Payments" },
  { value: "receipts", label: "Receipts" },
] as const;

type ViewTab = typeof VIEW_TABS[number]["value"];

function PaymentCard({ row, onView }: { row: CustomerPayment; onView: (r: CustomerPayment) => void }) {
  const isReversed = row.is_reversed;
  return (
    <CPageCard onClick={() => onView(row)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <ERPStatusBadge
              status={row.subscription_plan_type || "EMI"}
              label={row.subscription_plan_type ? formatPlanTypeLabel(row.subscription_plan_type) : "EMI"}
              hideIcon
            />
            {isReversed ? <ERPStatusBadge status="REVERSED" label="Reversed" /> : null}
          </div>
          <div className="text-sm font-semibold text-foreground">
            {row.subscription_number || `SUB-${row.subscription}`}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.method || "—"} · {formatDate(row.payment_date || row.created_at)}
          </div>
        </div>
        <span className={`text-base font-bold ${isReversed ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {formatRupee(row.amount)}
        </span>
      </div>
    </CPageCard>
  );
}

function ReceiptCard({ receipt }: { receipt: FinanceReceiptRow }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {receipt.receipt_no || `RCT-${receipt.id}`}
          </div>
          {receipt.subscription_number ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{receipt.subscription_number}</div>
          ) : null}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(receipt.receipt_date)} · {receipt.payment_method || "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-base font-bold text-foreground">{formatRupee(receipt.amount)}</span>
          <a
            href={downloadReceiptHref(receipt.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            PDF
          </a>
        </div>
      </div>
    </div>
  );
}

export default function CustomerPaymentsPage() {
  const router = useRouter();
  const [viewTab, setViewTab] = useState<ViewTab>("payments");
  const [rows, setRows] = useState<CustomerPayment[]>([]);
  const [count, setCount] = useState(0);
  const [totalPaid, setTotalPaid] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReturnType<typeof splitReceipts>>({
    directSale: [], rentLease: [], emi: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentPayload, receiptPayload] = await Promise.all([
        listCustomerPayments({}),
        listCustomerReceipts(),
      ]);
      setRows(paymentPayload.results);
      setCount(paymentPayload.count);
      setTotalPaid(String(paymentPayload.total_paid_amount || "0.00"));
      setReceipts(splitReceipts(receiptPayload.results || []));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reversedCount = useMemo(() => rows.filter((r) => r.is_reversed).length, [rows]);
  const totalReceipts = receipts.directSale.length + receipts.rentLease.length + receipts.emi.length;

  return (
    <CustomerPageShell
      title="Payments & Receipts"
      subtitle="Your complete payment history and receipts"
      actions={
        <Link
          href="/customer/emis"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          EMIs
        </Link>
      }
    >
      {/* Stats */}
      {!loading && (count > 0 || totalReceipts > 0) ? (
        <CPageStats>
          <CPageStat label="Total Paid" value={formatRupee(totalPaid)} tone="success" />
          <CPageStat label="Payments" value={count} />
          <CPageStat label="Receipts" value={totalReceipts} />
          {reversedCount > 0 ? <CPageStat label="Reversed" value={reversedCount} tone="danger" /> : null}
        </CPageStats>
      ) : null}

      {/* View tabs */}
      <CPageSection>
        <CPageTabs
          tabs={[
            { value: "payments", label: "Payments", count },
            { value: "receipts", label: "Receipts", count: totalReceipts },
          ]}
          active={viewTab}
          onChange={setViewTab}
        />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading payments..." /> : null}

      {!loading && error ? (
        <ERPErrorState title="Unable to load payments" description={error} onRetry={() => void load()} />
      ) : null}

      {/* Payments tab */}
      {!loading && !error && viewTab === "payments" ? (
        rows.length === 0 ? (
          <ERPEmptyState
            title="No payments yet"
            description="Your EMI and subscription payments will appear here."
          />
        ) : (
          <CPageSection title={`${count} payment${count !== 1 ? "s" : ""}`}>
            <div className="space-y-3">
              {rows.map((row) => (
                <PaymentCard
                  key={row.id}
                  row={row}
                  onView={(r) => router.push(`/customer/payments/${r.id}`)}
                />
              ))}
            </div>
          </CPageSection>
        )
      ) : null}

      {/* Receipts tab */}
      {!loading && !error && viewTab === "receipts" ? (
        totalReceipts === 0 ? (
          <ERPEmptyState title="No receipts yet" description="Receipts are generated when payments are recorded." />
        ) : (
          <>
            {receipts.emi.length > 0 ? (
              <CPageSection title={`EMI Receipts (${receipts.emi.length})`}>
                <div className="space-y-3">
                  {receipts.emi.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
                </div>
              </CPageSection>
            ) : null}
            {receipts.rentLease.length > 0 ? (
              <CPageSection title={`Rent / Lease Receipts (${receipts.rentLease.length})`}>
                <div className="space-y-3">
                  {receipts.rentLease.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
                </div>
              </CPageSection>
            ) : null}
            {receipts.directSale.length > 0 ? (
              <CPageSection title={`Direct Sale Receipts (${receipts.directSale.length})`}>
                <div className="space-y-3">
                  {receipts.directSale.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
                </div>
              </CPageSection>
            ) : null}
          </>
        )
      ) : null}
    </CustomerPageShell>
  );
}
