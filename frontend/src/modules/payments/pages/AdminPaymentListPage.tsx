"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SafeRowContextAction } from "@/components/ui/table-row-context-menu";
import { ROUTES } from "@/lib/routes";
import { listPayments, type PaymentRecord } from "@/services/payments";
import { downloadCsv } from "@/lib/export/csv";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";

function money(value: string): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function paymentRowContextActions(row: PaymentRecord): SafeRowContextAction[] {
  const actions: SafeRowContextAction[] = [
    { type: "link", label: "Open payment detail", href: `${ROUTES.admin.payments}/${row.id}` },
    { type: "copy", label: "Copy payment ID", value: String(row.id) },
  ];
  const reference = row.reference_no?.trim();
  if (reference) {
    actions.push({ type: "copy", label: "Copy reference number", value: reference });
  }
  actions.push({ type: "separator" });
  actions.push({
    type: "link",
    label: "Open subscription",
    href: `${ROUTES.admin.subscriptions}/${row.subscription}`,
  });
  if (row.customer) {
    actions.push({
      type: "link",
      label: "Open customer",
      href: `${ROUTES.admin.customers}/${row.customer}`,
    });
  }
  actions.push({ type: "separator" });
  actions.push({ type: "link", label: "Audit events", href: ROUTES.admin.auditEvents });
  return actions;
}

export default function AdminPaymentListPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  const requestKey = `${query}|${method}|${page}`;

  useEffect(() => {
    let cancelled = false;

    listPayments({ q: query || undefined, method: method || undefined, page })
      .then((payload: Awaited<ReturnType<typeof listPayments>>) => {
        if (cancelled) return;
        setRows(payload.results || []);
        setCount(payload.count || 0);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setCount(0);
        setError(err instanceof Error ? err.message : "Failed to load payments");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [method, page, query, requestKey]);

  const loading = loadedKey !== requestKey;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 10)), [count]);

  return (
    <PortalPage
      title="Payment Management"
      subtitle="Operational payment register for EMI collections and references."
    >
      <section
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "2fr 1fr auto",
          marginBottom: 16,
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by payment ID, reference, customer, subscription"
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="">All methods</option>
          <option value="CASH">CASH</option>
          <option value="UPI">UPI</option>
          <option value="BANK">BANK</option>
          <option value="CARD">CARD</option>
        </select>
        <button type="button" onClick={() => setPage(1)}>
          Apply
        </button>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Quick method filter</div>
        <ToggleGroup
          type="single"
          value={method || "ALL"}
          onValueChange={(value: string) => {
            setPage(1);
            if (value === "ALL") {
              setMethod("");
            } else if (value === "CASH" || value === "UPI" || value === "BANK" || value === "CARD") {
              setMethod(value);
            }
          }}
          aria-label="Payment method filter"
        >
          <ToggleGroupItem value="ALL">All</ToggleGroupItem>
          <ToggleGroupItem value="CASH">Cash</ToggleGroupItem>
          <ToggleGroupItem value="UPI">UPI</ToggleGroupItem>
          <ToggleGroupItem value="BANK">Bank</ToggleGroupItem>
          <ToggleGroupItem value="CARD">Card</ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}
      >
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              "payments.csv",
              [
                { key: "id", header: "id" },
                { key: "subscription", header: "subscription" },
                { key: "emi_month_no", header: "emi_month_no" },
                { key: "amount", header: "amount" },
                { key: "payment_date", header: "payment_date" },
                { key: "method", header: "method" },
                { key: "reference_no", header: "reference_no" },
                { key: "collected_by_username", header: "collected_by" },
                { key: "verified_by_username", header: "verified_by" },
              ],
              rows
            )
          }
        >
          Export Current View
        </button>
      </section>

      <DataTable<PaymentRecord>
        rows={rows}
        loading={loading}
        error={error}
        emptyText="No payments match this filter."
        showDensityToggle
        buildRowContextMenu={paymentRowContextActions}
        onRowClick={(row) => router.push(`/admin/payments/${row.id}`)}
        columns={[
          { key: "id", title: "Payment ID" },
          { key: "subscription", title: "Subscription" },
          {
            key: "emi_month_no",
            title: "EMI Ref",
            render: (row) => (row.emi_month_no ? `Month ${row.emi_month_no}` : "-"),
          },
          {
            key: "customer_name",
            title: "Customer",
            render: (row) => (
              <CustomerIntelligenceTrigger
                customerId={row.customer}
                customerName={row.customer_name || `Customer #${row.customer ?? "—"}`}
                scope="admin"
              />
            ),
          },
          {
            key: "amount",
            title: "Amount",
            align: "right",
            render: (row) => money(row.amount),
          },
          { key: "payment_date", title: "Payment Date" },
          { key: "method", title: "Method" },
          {
            key: "reference_no",
            title: "Reference",
            render: (row) => row.reference_no || "-",
          },
          {
            key: "collected_by_username",
            title: "Collected By",
            render: (row) => row.collected_by_username || "-",
          },
          {
            key: "verified_by_username",
            title: "Verified By",
            render: (row) => row.verified_by_username || "-",
          },
        ]}
      />

      <section
        style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}
      >
        <span>Total records: {count}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            Next
          </button>
        </div>
      </section>
    </PortalPage>
  );
}
